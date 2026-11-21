import { json } from '@tightlog/worker-utils/request/json';
import { parseJsonBody } from '@tightlog/worker-utils/request/parse-body';
import { getDb } from '../../db';
import { SyncRepo } from '../../repo';
import { schemaVersionError } from '../../schema';
import {
  isSyncTableName,
  SYNC_PUSH_MAX_BYTES,
  SYNC_PUSH_MAX_ROWS,
} from '../../http';
import { sanitizeRow, syncRowFromDb } from '../../tables';
import type { Env } from '../../types';
import { authenticate } from '../../utils/authenticate';
import { pushSchema } from '../../validation/push';
import { collectOrphanedMedia } from './collectOrphanedMedia';
import type { SyncErrorBody } from '../../http';

export async function handlePush(
  request: Request,
  env: Env,
  table: string,
  ctx: ExecutionContext,
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

  const body = await parseJsonBody(request, SYNC_PUSH_MAX_BYTES, pushSchema, {
    requireContentLength: true,
  });
  if (body instanceof Response) {
    return body;
  }

  const { items } = body;

  if (items === null) {
    return json<SyncErrorBody>({ error: 'items_required' }, 400);
  }

  if (items.length > SYNC_PUSH_MAX_ROWS) {
    return json<SyncErrorBody>({ error: 'too_many_rows' }, 413);
  }

  const nowMs = Date.now();
  const rows = items
    .map(item => sanitizeRow(table, item, nowMs))
    .filter(row => row !== null);

  if (rows.length === 0) {
    return json({ items: [] });
  }

  const repo = new SyncRepo(getDb(env));
  const merged = await repo.upsertRows(table, keyHash, rows);

  if (table === 'catch_media' && env.MEDIA) {
    ctx.waitUntil(collectOrphanedMedia(repo, env.MEDIA, keyHash, rows));
  }

  return json({
    items: merged.map(row => syncRowFromDb(table, row)),
  });
}
