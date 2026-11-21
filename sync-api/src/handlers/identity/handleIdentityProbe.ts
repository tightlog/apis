import { json } from '@tightlog/worker-utils/request/json';
import { getDb } from '../../db';
import { SyncRepo } from '../../repo';
import type { Env } from '../../types';
import { authenticate } from '../../utils/authenticate';

export async function handleIdentityProbe(
  request: Request,
  env: Env,
): Promise<Response> {
  const caller = await authenticate(request, env, env.SYNC_RATE_LIMITER);
  if (caller instanceof Response) {
    return caller;
  }

  const { keyHash } = caller;

  const summary = await new SyncRepo(getDb(env)).getIdentitySummary(keyHash);
  return json(summary);
}
