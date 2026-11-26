import { json } from '@tightlog/worker-utils/request/json';
import { getDb } from '../../db';
import { encryptKeyEscrow, isEscrowSecret } from '../../key-escrow';
import { SyncRepo } from '../../repo';
import type { Env } from '../../types';
import { authenticate } from '../../utils/authenticate';
import type { SyncErrorBody, SyncOkResponse } from '../../http';

export async function handleEscrowKey(
  request: Request,
  env: Env,
): Promise<Response> {
  const caller = await authenticate(request, env, env.SYNC_RATE_LIMITER);
  if (caller instanceof Response) {
    return caller;
  }

  const secret = env.KEY_ESCROW_SECRET;
  if (!secret || !isEscrowSecret(secret)) {
    return json<SyncErrorBody>({ error: 'not_configured' }, 501);
  }

  const repo = new SyncRepo(getDb(env));
  const user = await repo.getOrCreateUser(caller.keyHash);
  const ciphertext = await encryptKeyEscrow(secret, caller.token, {
    userId: user.id,
    keyHash: caller.keyHash,
  });
  await repo.setKeyEscrow(user.id, ciphertext).run();

  return json<SyncOkResponse>({ ok: true });
}
