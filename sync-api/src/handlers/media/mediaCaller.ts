import { json } from '@tightlog/worker-utils/request/json';
import { getDb } from '../../db';
import { SyncRepo } from '../../repo';
import type { Env } from '../../types';
import { authenticate } from '../../utils/authenticate';
import type { SyncErrorBody } from '../../http';

interface MediaCaller<UserId> {
  userId: UserId;
  bucket: R2Bucket;
  repo: SyncRepo;
}

async function authenticateMedia(
  request: Request,
  env: Env,
): Promise<{ keyHash: string; bucket: R2Bucket; repo: SyncRepo } | Response> {
  const bucket = env.MEDIA;
  if (!bucket) {
    return json<SyncErrorBody>({ error: 'media_unavailable' }, 503);
  }

  const caller = await authenticate(request, env, env.MEDIA_RATE_LIMITER);
  if (caller instanceof Response) {
    return caller;
  }

  return { keyHash: caller.keyHash, bucket, repo: new SyncRepo(getDb(env)) };
}

export async function mediaWriter(
  request: Request,
  env: Env,
): Promise<MediaCaller<string> | Response> {
  const caller = await authenticateMedia(request, env);
  if (caller instanceof Response) {
    return caller;
  }

  const { keyHash, bucket, repo } = caller;
  return { userId: await repo.ensureUserId(keyHash), bucket, repo };
}

export async function mediaReader(
  request: Request,
  env: Env,
): Promise<MediaCaller<string | null> | Response> {
  const caller = await authenticateMedia(request, env);
  if (caller instanceof Response) {
    return caller;
  }

  const { keyHash, bucket, repo } = caller;
  return { userId: await repo.getUserId(keyHash), bucket, repo };
}
