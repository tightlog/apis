import { json } from '@tightlog/worker-utils/request/json';
import { getDb } from '../../db';
import { SyncRepo } from '../../repo';
import type { Env } from '../../types';
import { authenticate } from '../../utils/authenticate';
import type { SyncOkResponse } from '../../http';

export async function handleEscrowKeyDelete(
  request: Request,
  env: Env,
): Promise<Response> {
  const caller = await authenticate(request, env, env.SYNC_RATE_LIMITER);
  if (caller instanceof Response) {
    return caller;
  }

  const { keyHash } = caller;

  const repo = new SyncRepo(getDb(env));
  const user = await repo.getOrCreateUser(keyHash);
  await repo.setKeyEscrow(user.id, null).run();

  return json<SyncOkResponse>({ ok: true });
}
