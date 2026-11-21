import {
  parseContentAddressedBasename,
  SYNC_MEDIA_STATUS_MAX_NAMES,
} from '../../http';
import type { MediaStatusResponse, SyncErrorBody } from '../../http';
import { json } from '@tightlog/worker-utils/request/json';
import { parseJsonBody } from '@tightlog/worker-utils/request/parse-body';
import type { Env } from '../../types';
import {
  mediaStatusBodyLimit,
  mediaStatusSchema,
} from '../../validation/media';
import { mediaReader } from './mediaCaller';

export async function handleMediaStatus(
  request: Request,
  env: Env,
): Promise<Response> {
  const caller = await mediaReader(request, env);

  if (caller instanceof Response) {
    return caller;
  }

  const body = await parseJsonBody(
    request,
    mediaStatusBodyLimit,
    mediaStatusSchema,
  );

  if (body instanceof Response) {
    return body;
  }

  const { names } = body;
  if (names === null) {
    return json<SyncErrorBody>({ error: 'names_required' }, 400);
  }

  if (names.length > SYNC_MEDIA_STATUS_MAX_NAMES) {
    return json<SyncErrorBody>({ error: 'too_many_names' }, 413);
  }

  const wanted = names.filter(
    name => parseContentAddressedBasename(name) !== null,
  );
  const [present, usage] =
    caller.userId === null
      ? [new Set<string>(), { bytes: 0, objects: 0 }]
      : await Promise.all([
          caller.repo.listExistingMediaBasenames(caller.userId, wanted),
          caller.repo.mediaUsage(caller.userId),
        ]);

  const response: MediaStatusResponse = {
    missing: wanted.filter(name => !present.has(name)),
    usage,
  };
  return json(response);
}
