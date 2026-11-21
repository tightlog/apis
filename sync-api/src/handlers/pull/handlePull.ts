import { json } from '@tightlog/worker-utils/request/json';
import { SYNC_SINCE_PARAM, isSyncTableName } from '../../http';
import { getDb } from '../../db';
import { SyncRepo } from '../../repo';
import { schemaVersionError } from '../../schema';
import { syncRowFromDb } from '../../tables';
import type { Env } from '../../types';
import { authenticate } from '../../utils/authenticate';
import type { SyncErrorBody } from '../../http';

export async function handlePull(
  request: Request,
  env: Env,
  table: string,
  url: URL,
): Promise<Response> {
  if (!isSyncTableName(table)) {
    return json<SyncErrorBody>({ error: 'unknown_table' }, 404);
  }

  const outdated = schemaVersionError(request);
  if (outdated) {
    return outdated;
  }

  const caller = await authenticate(request, env, env.SYNC_RATE_LIMITER);
  if (caller instanceof Response) {
    return caller;
  }

  const { keyHash } = caller;

  const since = Number(url.searchParams.get(SYNC_SINCE_PARAM) ?? 0);
  const sinceMs = Number.isFinite(since) && since > 0 ? Math.trunc(since) : 0;

  const { rows, nextSince } = await new SyncRepo(getDb(env)).listSince(
    table,
    keyHash,
    sinceMs,
  );
  return json({
    items: rows.map(row => syncRowFromDb(table, row)),
    nextSince,
  });
}
