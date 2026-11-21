import { extractSyncKey } from '../auth';
import type { Env } from '../types';
import {
  clientKey,
  rateLimited,
} from '@tightlog/worker-utils/request/rate-limit';
import { json } from '@tightlog/worker-utils/request/json';
import { sha256HexOfText } from '@tightlog/worker-utils/utils/sha256';
import type { SyncErrorBody } from '../http';

export interface SyncCaller {
  token: string;
  keyHash: string;
}

export async function authenticate(
  request: Request,
  env: Env,
  limiter: RateLimit | undefined,
): Promise<SyncCaller | Response> {
  const throttled = await rateLimited(
    env.SYNC_IP_RATE_LIMITER,
    clientKey(request),
  );
  if (throttled) {
    return throttled;
  }

  const token = extractSyncKey(request);
  if (!token) {
    return json<SyncErrorBody>({ error: 'unauthorized' }, 401);
  }

  const keyHash = await sha256HexOfText(token);
  return (await rateLimited(limiter, keyHash)) ?? { token, keyHash };
}
