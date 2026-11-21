import { json } from '@tightlog/worker-utils/request/json';
import { r2Get } from '@tightlog/worker-utils/services/r2';
import { parseContentAddressedBasename } from '../../http';
import { mediaKey } from '../../media';
import type { Env } from '../../types';
import { mediaReader } from './mediaCaller';
import type { SyncErrorBody } from '../../http';

export async function handleMediaGet(
  request: Request,
  env: Env,
  basename: string,
): Promise<Response> {
  if (!parseContentAddressedBasename(basename)) {
    return json<SyncErrorBody>({ error: 'invalid_basename' }, 400);
  }

  const caller = await mediaReader(request, env);

  if (caller instanceof Response) {
    return caller;
  }

  if (caller.userId === null) {
    return json<SyncErrorBody>({ error: 'not_found' }, 404);
  }

  return r2Get(caller.bucket, mediaKey(caller.userId, basename), request, {
    cacheControl: 'private, max-age=31536000, immutable',
  });
}
