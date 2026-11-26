import { json } from '@tightlog/worker-utils/request/json';
import { getDb } from '../../db';
import { SyncRepo } from '../../repo';
import type { Env } from '../../types';
import { authenticate } from '../../utils/authenticate';
import type { RecoveryNoticesResponse } from '../../http';

export async function handleRecoveryNoticesPull(
  request: Request,
  env: Env,
): Promise<Response> {
  const caller = await authenticate(request, env, env.SYNC_RATE_LIMITER);
  if (caller instanceof Response) {
    return caller;
  }

  const { keyHash } = caller;

  const notices = await new SyncRepo(getDb(env)).listUnreadRecoveryNotices(
    keyHash,
  );
  return json<RecoveryNoticesResponse>({ items: notices });
}
