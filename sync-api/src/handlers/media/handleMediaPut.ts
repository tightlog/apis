import { bodyErrorResponse } from '@tightlog/worker-utils/request/body';
import { checkContentLength } from '@tightlog/worker-utils/request/size';
import { clientKey } from '@tightlog/worker-utils/request/rate-limit';
import { json } from '@tightlog/worker-utils/request/json';
import { sha256HexOfText } from '@tightlog/worker-utils/utils/sha256';
import {
  parseContentAddressedBasename,
  mediaQuotaExceeded,
  SYNC_MEDIA_MAX_BYTES,
  SYNC_MEDIA_QUOTA_BYTES,
  SYNC_MEDIA_QUOTA_OBJECTS,
} from '../../http';
import { MAX_IP_DAILY_UPLOAD_BYTES, mediaKey, utcDay } from '../../media';
import type { SyncRepo } from '../../repo';
import type { Env } from '../../types';
import { mediaWriter } from './mediaCaller';
import type { MediaPutResponse, SyncErrorBody } from '../../http';

async function quotaRefusal(
  repo: SyncRepo,
  userId: string,
  declared: number,
): Promise<Response> {
  const quota =
    mediaQuotaExceeded(await repo.mediaUsage(userId), declared) ??
    'media_quota_bytes';
  return json<SyncErrorBody>({ error: quota }, 413);
}

export async function handleMediaPut(
  request: Request,
  env: Env,
  basename: string,
): Promise<Response> {
  const parsed = parseContentAddressedBasename(basename);

  if (!parsed) {
    return json<SyncErrorBody>({ error: 'invalid_basename' }, 400);
  }

  const caller = await mediaWriter(request, env);

  if (caller instanceof Response) {
    return caller;
  }

  const length = checkContentLength(request, SYNC_MEDIA_MAX_BYTES);
  if (!length.ok) {
    return bodyErrorResponse(
      length.reason === 'too_large'
        ? 'payload_too_large'
        : 'content_length_required',
    );
  }

  if (!request.body || request.headers.get('content-length') === '0') {
    return json<SyncErrorBody>({ error: 'body_required' }, 400);
  }

  const declared = Number(request.headers.get('content-length'));
  const { bucket, repo, userId } = caller;

  const reserved = await repo.reserveMediaObject(
    userId,
    { basename, bytes: declared, contentType: parsed.contentType },
    { maxBytes: SYNC_MEDIA_QUOTA_BYTES, maxObjects: SYNC_MEDIA_QUOTA_OBJECTS },
  );

  if (!reserved && !(await repo.hasMediaObject(userId, basename))) {
    return quotaRefusal(repo, userId, declared);
  }

  const day = utcDay(Date.now());
  const ipHash = await sha256HexOfText(clientKey(request));

  const release = async (): Promise<void> => {
    if (reserved) {
      await repo.releaseMediaReservation(userId, basename);
    }
  };

  if (
    !(await repo.reserveUploadBudget(
      day,
      ipHash,
      declared,
      MAX_IP_DAILY_UPLOAD_BYTES,
    ))
  ) {
    await release();
    return json<SyncErrorBody>({ error: 'media_quota_daily' }, 429);
  }

  const releaseAll = async (): Promise<void> => {
    await release();
    await repo.refundUploadBudget(day, ipHash, declared);
  };

  let stored: R2Object | null;

  try {
    stored = await bucket.put(mediaKey(userId, basename), request.body, {
      httpMetadata: { contentType: parsed.contentType },
      sha256: parsed.sha256,
    });
  } catch (error) {
    await releaseAll();
    // The R2 binding puts the R2 error code at the end of the message. 10037
    // is BadDigest: the body does not match the sha256 given with the put.
    if (error instanceof Error && error.message.endsWith('(10037)')) {
      return json<SyncErrorBody>({ error: 'checksum_mismatch' }, 422);
    }

    throw error;
  }

  if (!stored) {
    await releaseAll();
    return json<SyncErrorBody>({ error: 'upload_failed' }, 500);
  }

  await repo.upsertMediaObject(userId, {
    basename,
    bytes: stored.size,
    contentType: parsed.contentType,
  });
  return json<MediaPutResponse>({ basename, bytes: stored.size });
}
