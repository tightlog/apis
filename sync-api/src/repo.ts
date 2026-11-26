import { isRecoveryNoticeKind } from './http';
import type {
  IdentitySummary,
  RecoveryNotice,
  SyncErrorCode,
  SyncTableName,
} from './http';
import { ResponseError } from '@tightlog/worker-utils/worker/fetch';
import type {
  Db,
  SqlRow,
  Statement,
} from '@tightlog/worker-utils/services/libsql';
import type { SanitizedRow } from './tables';
import { dataColumns } from './tables';
import type { SyncUser } from './types';

class SyncBoundaryOverflowError extends ResponseError {
  constructor() {
    super('sync_boundary_overflow' satisfies SyncErrorCode, 503);
  }
}

interface UserRow {
  id: string;
  key_hash: string;
  clerk_user_id: string | null;
  revenuecat_app_user_id: string | null;
  email: string | null;
  account_name: string | null;
  angler_name: string | null;
  created_at: string;
  last_synced_at: string | null;
  key_escrow: string | null;
}

function userFromRow(row: UserRow): SyncUser {
  return {
    id: row.id,
    keyHash: row.key_hash,
    clerkUserId: row.clerk_user_id,
    revenueCatAppUserId: row.revenuecat_app_user_id,
    email: row.email,
    accountName: row.account_name,
    anglerName: row.angler_name,
    createdAt: row.created_at,
    lastSyncedAt: row.last_synced_at,
    keyEscrow: row.key_escrow,
  };
}

const USER_ID_BY_KEY_HASH = '(SELECT id FROM users WHERE key_hash = ?)';

const NOTICE_FOR_KEY_HASH = `(key_hash = ? OR (key_hash IS NULL AND user_id = ${USER_ID_BY_KEY_HASH}))`;

const MAX_ACK_IDS = 200;

const READBACK_CHUNK = 99;

const UPSERT_CHUNK = 50;

export const PULL_PAGE_SIZE = 200;

const MAX_BOUNDARY_COHORT = 2_000;

export interface UserMeta {
  anglerName?: string | null;
  clerkUserId?: string | null;
  email?: string | null;
  accountName?: string | null;
}

interface DeviceMeta {
  deviceId: string;
  platform: string | null;
  model: string | null;
  osName: string | null;
  osVersion: string | null;
  appVersion: string | null;
}

export interface MediaObjectRow {
  user_id: string;
  basename: string;
  bytes: number;
  content_type: string;
  created_at: string;
  committed: number;
}

interface RecoveryNoticeRow {
  id: string;
  kind: string;
  created_at: string;
}

function syncSelectColumns(table: SyncTableName): string {
  return ['id', ...dataColumns(table), 'updated_at_ms', 'deleted_at'].join(
    ', ',
  );
}

export class SyncRepo {
  private readonly db: Db;

  constructor(db: Db) {
    this.db = db;
  }

  async getOrCreateUser(keyHash: string): Promise<SyncUser> {
    const existing = await this.db
      .prepare('SELECT * FROM users WHERE key_hash = ?')
      .bind(keyHash)
      .first<UserRow>();

    if (existing) {
      return userFromRow(existing);
    }

    const created = await this.db
      .prepare(
        `INSERT INTO users (id, key_hash) VALUES (?, ?)
         ON CONFLICT (key_hash) DO UPDATE SET key_hash = excluded.key_hash
         RETURNING *`,
      )
      .bind(crypto.randomUUID(), keyHash)
      .first<UserRow>();

    if (!created) {
      throw new Error('user upsert returned no row');
    }

    return userFromRow(created);
  }

  private insertUserIfMissing(keyHash: string): Statement {
    return this.db
      .prepare(
        `INSERT INTO users (id, key_hash) VALUES (?, ?)
         ON CONFLICT (key_hash) DO NOTHING`,
      )
      .bind(crypto.randomUUID(), keyHash);
  }

  async getUserId(keyHash: string): Promise<string | null> {
    const row = await this.db
      .prepare('SELECT id FROM users WHERE key_hash = ?')
      .bind(keyHash)
      .first<{ id: string }>();
    return row?.id ?? null;
  }

  async getIdentitySummary(keyHash: string): Promise<IdentitySummary> {
    const row = await this.db
      .prepare(
        `SELECT (SELECT COUNT(*) FROM catches
                 WHERE user_id = users.id AND deleted_at IS NULL) AS n
         FROM users WHERE key_hash = ?`,
      )
      .bind(keyHash)
      .first<{ n: number }>();
    return row ? { known: true, catches: row.n } : { known: false, catches: 0 };
  }

  async listUnreadRecoveryNotices(keyHash: string): Promise<RecoveryNotice[]> {
    const result = await this.db
      .prepare(
        `SELECT id, kind, created_at FROM recovery_notices
         WHERE ${NOTICE_FOR_KEY_HASH} AND read_at IS NULL
         ORDER BY created_at ASC`,
      )
      .bind(keyHash, keyHash)
      .all<RecoveryNoticeRow>();
    return result.results.flatMap(({ id, kind, created_at }) =>
      isRecoveryNoticeKind(kind) ? [{ id, kind, createdAt: created_at }] : [],
    );
  }

  markRecoveryNoticesRead(keyHash: string, allIds: string[]): Statement {
    const ids = allIds.slice(0, MAX_ACK_IDS);
    const placeholders = ids.map(() => '?').join(', ');
    return this.db
      .prepare(
        `UPDATE recovery_notices SET read_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE ${NOTICE_FOR_KEY_HASH} AND id IN (${placeholders})`,
      )
      .bind(keyHash, keyHash, ...ids);
  }

  updateUserMeta(userId: string, meta: UserMeta): Statement {
    return this.db
      .prepare(
        `UPDATE users SET
           angler_name = COALESCE(?, angler_name),
           clerk_user_id = COALESCE(?, clerk_user_id),
           email = COALESCE(?, email),
           account_name = COALESCE(?, account_name)
         WHERE id = ?`,
      )
      .bind(
        meta.anglerName ?? null,
        meta.clerkUserId ?? null,
        meta.email ?? null,
        meta.accountName ?? null,
        userId,
      );
  }

  setKeyEscrow(userId: string, ciphertext: string | null): Statement {
    return this.db
      .prepare(
        `UPDATE users SET
           key_escrow = ?,
           key_escrow_updated_at = CASE WHEN ? IS NULL THEN NULL ELSE strftime('%Y-%m-%dT%H:%M:%fZ', 'now') END
         WHERE id = ?`,
      )
      .bind(ciphertext, ciphertext, userId);
  }

  upsertDevice(userId: string, device: DeviceMeta): Statement {
    return this.db
      .prepare(
        `INSERT INTO devices
           (user_id, device_id, platform, model, os_name, os_version, app_version, last_seen_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
         ON CONFLICT (user_id, device_id) DO UPDATE SET
           platform = excluded.platform,
           model = excluded.model,
           os_name = excluded.os_name,
           os_version = excluded.os_version,
           app_version = excluded.app_version,
           last_seen_at = excluded.last_seen_at`,
      )
      .bind(
        userId,
        device.deviceId,
        device.platform,
        device.model,
        device.osName,
        device.osVersion,
        device.appVersion,
      );
  }

  async getUserByClerkId(clerkUserId: string): Promise<SyncUser | null> {
    const row = await this.db
      .prepare('SELECT * FROM users WHERE clerk_user_id = ?')
      .bind(clerkUserId)
      .first<UserRow>();

    return row ? userFromRow(row) : null;
  }

  claimRevenueCatId(userId: string, appUserId: string): Statement {
    return this.db
      .prepare(
        `UPDATE users SET revenuecat_app_user_id = ?1
         WHERE id = ?2
           AND revenuecat_app_user_id IS NULL
           AND NOT EXISTS (
             SELECT 1 FROM users WHERE revenuecat_app_user_id = ?1
           )`,
      )
      .bind(appUserId, userId);
  }

  async getUserByRevenueCatId(appUserId: string): Promise<SyncUser | null> {
    const row = await this.db
      .prepare('SELECT * FROM users WHERE revenuecat_app_user_id = ?')
      .bind(appUserId)
      .first<UserRow>();
    return row ? userFromRow(row) : null;
  }

  async userHasData(userId: string): Promise<boolean> {
    const row = await this.db
      .prepare(
        `SELECT EXISTS (SELECT 1 FROM catches WHERE user_id = ?1)
              + EXISTS (SELECT 1 FROM spots WHERE user_id = ?1)
              + EXISTS (SELECT 1 FROM sessions WHERE user_id = ?1)
              + EXISTS (SELECT 1 FROM catch_media WHERE user_id = ?1)
              + EXISTS (SELECT 1 FROM media_objects WHERE user_id = ?1) AS n`,
      )
      .bind(userId)
      .first<{ n: number }>();
    return (row?.n ?? 0) > 0;
  }

  async ensureUserId(keyHash: string): Promise<string> {
    const existing = await this.getUserId(keyHash);
    if (existing) {
      return existing;
    }

    await this.insertUserIfMissing(keyHash).run();
    const created = await this.getUserId(keyHash);
    if (!created) {
      throw new Error('user insert returned no id');
    }

    return created;
  }

  async mediaUsage(
    userId: string,
  ): Promise<{ bytes: number; objects: number }> {
    const row = await this.db
      .prepare(
        `SELECT COALESCE(SUM(bytes), 0) AS bytes, COUNT(*) AS objects
         FROM media_objects WHERE user_id = ?`,
      )
      .bind(userId)
      .first<{ bytes: number; objects: number }>();
    return { bytes: row?.bytes ?? 0, objects: row?.objects ?? 0 };
  }

  async rekeyUser(
    user: SyncUser,
    newKeyHash: string,
    placeholderUserId: string | null,
  ): Promise<void> {
    const statements = [];
    if (placeholderUserId !== null && placeholderUserId !== user.id) {
      statements.push(
        this.db
          .prepare('DELETE FROM users WHERE id = ?')
          .bind(placeholderUserId),
      );
    }

    statements.push(
      this.db
        .prepare(
          `INSERT INTO recovery_notices (id, user_id, kind, key_hash)
           VALUES (?, ?, 'account_relinked', ?)`,
        )
        .bind(crypto.randomUUID(), user.id, user.keyHash),
      this.db
        .prepare(
          `UPDATE users SET
             key_hash = ?,
             key_escrow = NULL,
             key_escrow_updated_at = NULL
           WHERE id = ?`,
        )
        .bind(newKeyHash, user.id),
    );

    await this.db.batch(statements);
  }

  async listSince(
    table: SyncTableName,
    keyHash: string,
    sinceMs: number,
  ): Promise<{ rows: SqlRow[]; nextSince: number | null }> {
    const columns = syncSelectColumns(table);
    const page = await this.db
      .prepare(
        `SELECT user_id, ${columns} FROM ${table}
         WHERE user_id = ${USER_ID_BY_KEY_HASH} AND updated_at_ms > ?
         ORDER BY updated_at_ms ASC
         LIMIT ?`,
      )
      .bind(keyHash, sinceMs, PULL_PAGE_SIZE)
      .all();

    const rows = page.results;

    if (rows.length < PULL_PAGE_SIZE) {
      return { rows, nextSince: null };
    }

    // SAFETY: updated_at_ms is an INTEGER column, and the SELECT above reads it.
    const boundaryMs = rows.at(-1)?.['updated_at_ms'] as number;
    const firstRow = rows[0];
    if (!firstRow) {
      return { rows, nextSince: null };
    }

    // SAFETY: user_id is a TEXT column, and the page above selects it.
    const group = await this.db
      .prepare(
        `SELECT ${columns} FROM ${table}
         WHERE user_id = ? AND updated_at_ms = ?
         ORDER BY id ASC
         LIMIT ?`,
      )
      .bind(firstRow['user_id'] as string, boundaryMs, MAX_BOUNDARY_COHORT)
      .all();

    if (group.results.length >= MAX_BOUNDARY_COHORT) {
      throw new SyncBoundaryOverflowError();
    }

    const seen = new Set(rows.map(row => row['id']));
    for (const row of group.results) {
      if (!seen.has(row['id'])) {
        rows.push(row);
      }
    }

    return { rows, nextSince: boundaryMs };
  }

  async upsertMediaObject(
    userId: string,
    object: { basename: string; bytes: number; contentType: string },
  ): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO media_objects (user_id, basename, bytes, content_type)
         VALUES (?, ?, ?, ?)
         ON CONFLICT (user_id, basename) DO UPDATE SET
           bytes = excluded.bytes,
           content_type = excluded.content_type,
           committed = 1`,
      )
      .bind(userId, object.basename, object.bytes, object.contentType)
      .run();
  }

  async listExistingMediaBasenames(
    userId: string,
    basenames: string[],
  ): Promise<Set<string>> {
    if (basenames.length === 0) {
      return new Set();
    }

    const placeholders = basenames.map(() => '?').join(', ');
    const result = await this.db
      .prepare(
        `SELECT basename FROM media_objects
         WHERE user_id = ? AND committed = 1 AND basename IN (${placeholders})`,
      )
      .bind(userId, ...basenames)
      .all<{ basename: string }>();
    return new Set(result.results.map(row => row.basename));
  }

  async hasMediaObject(userId: string, basename: string): Promise<boolean> {
    const row = await this.db
      .prepare(
        'SELECT 1 AS found FROM media_objects WHERE user_id = ? AND basename = ?',
      )
      .bind(userId, basename)
      .first<{ found: number }>();
    return row !== null;
  }

  async reserveMediaObject(
    userId: string,
    object: { basename: string; bytes: number; contentType: string },
    quota: { maxBytes: number; maxObjects: number },
  ): Promise<boolean> {
    const row = await this.db
      .prepare(
        `INSERT INTO media_objects (user_id, basename, bytes, content_type, committed)
         SELECT ?1, ?2, ?3, ?4, 0
         WHERE (SELECT COUNT(*) FROM media_objects WHERE user_id = ?1) < ?5
           AND (SELECT COALESCE(SUM(bytes), 0) FROM media_objects WHERE user_id = ?1) + ?3 <= ?6
         ON CONFLICT (user_id, basename) DO NOTHING
         RETURNING basename`,
      )
      .bind(
        userId,
        object.basename,
        object.bytes,
        object.contentType,
        quota.maxObjects,
        quota.maxBytes,
      )
      .first<{ basename: string }>();
    return row !== null;
  }

  async releaseMediaReservation(
    userId: string,
    basename: string,
  ): Promise<void> {
    await this.db
      .prepare(
        `DELETE FROM media_objects
         WHERE user_id = ? AND basename = ? AND committed = 0`,
      )
      .bind(userId, basename)
      .run();
  }

  async reserveUploadBudget(
    day: string,
    ipHash: string,
    bytes: number,
    maxBytes: number,
  ): Promise<boolean> {
    const row = await this.db
      .prepare(
        `INSERT INTO media_upload_budget (day, ip_hash, bytes)
         SELECT ?1, ?2, ?3 WHERE ?3 <= ?4
         ON CONFLICT (day, ip_hash) DO UPDATE SET
           bytes = media_upload_budget.bytes + excluded.bytes
         WHERE media_upload_budget.bytes + excluded.bytes <= ?4
         RETURNING bytes`,
      )
      .bind(day, ipHash, bytes, maxBytes)
      .first<{ bytes: number }>();
    return row !== null;
  }

  async refundUploadBudget(
    day: string,
    ipHash: string,
    bytes: number,
  ): Promise<void> {
    await this.db
      .prepare(
        `UPDATE media_upload_budget SET bytes = MAX(bytes - ?, 0)
         WHERE day = ? AND ip_hash = ?`,
      )
      .bind(bytes, day, ipHash)
      .run();
  }

  async pruneUploadBudget(beforeDay: string): Promise<void> {
    await this.db
      .prepare('DELETE FROM media_upload_budget WHERE day < ?')
      .bind(beforeDay)
      .run();
  }

  async deleteUnreferencedMedia(
    createdBefore: string,
    limit: number,
  ): Promise<MediaObjectRow[]> {
    const result = await this.db
      .prepare(
        `DELETE FROM media_objects WHERE rowid IN (
           SELECT mo.rowid FROM media_objects mo
           WHERE mo.created_at < ?
             AND NOT EXISTS (
               SELECT 1 FROM catch_media cm
               WHERE cm.user_id = mo.user_id AND cm.basename = mo.basename
             )
           LIMIT ?
         )
         RETURNING user_id, basename, bytes, content_type, created_at, committed`,
      )
      .bind(createdBefore, limit)
      .all<MediaObjectRow>();
    return result.results;
  }

  async restoreMediaObjects(rows: MediaObjectRow[]): Promise<void> {
    await this.db.batch(
      rows.map(row =>
        this.db
          .prepare(
            `INSERT INTO media_objects (user_id, basename, bytes, content_type, created_at, committed)
             VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT (user_id, basename) DO NOTHING`,
          )
          .bind(
            row.user_id,
            row.basename,
            row.bytes,
            row.content_type,
            row.created_at,
            row.committed,
          ),
      ),
    );
  }

  async listOrphanedMediaBasenames(
    userId: string,
    candidates: string[],
  ): Promise<string[]> {
    if (candidates.length === 0) {
      return [];
    }

    const placeholders = candidates.map(() => '?').join(', ');
    const result = await this.db
      .prepare(
        `SELECT DISTINCT basename FROM catch_media
         WHERE user_id = ? AND deleted_at IS NULL
           AND basename IN (${placeholders})`,
      )
      .bind(userId, ...candidates)
      .all<{ basename: string }>();

    const stillUsed = new Set(result.results.map(row => row.basename));
    return candidates.filter(basename => !stillUsed.has(basename));
  }

  async deleteMediaObjects(userId: string, basenames: string[]): Promise<void> {
    if (basenames.length === 0) {
      return;
    }

    const placeholders = basenames.map(() => '?').join(', ');
    await this.db
      .prepare(
        `DELETE FROM media_objects
         WHERE user_id = ? AND basename IN (${placeholders})`,
      )
      .bind(userId, ...basenames)
      .run();
  }

  async upsertRows(
    table: SyncTableName,
    keyHash: string,
    rows: SanitizedRow[],
  ): Promise<SqlRow[]> {
    if (rows.length === 0) {
      return [];
    }

    const userId = await this.ensureUserId(keyHash);
    const columns = dataColumns(table);
    const columnCount = columns.length;
    const placeholders = Array.from(
      { length: columnCount + 4 },
      (_, i) => `?${i + 1}`,
    ).join(', ');
    const sentFrom = columnCount + 5;

    const updates = columns
      .map(
        (column, i) =>
          `${column} = CASE WHEN ?${sentFrom + i} THEN excluded.${column} ELSE ${table}.${column} END`,
      )
      .join(', ');

    const sql = `
      INSERT INTO ${table} (user_id, id, ${columns.join(', ')}, updated_at_ms, deleted_at)
      VALUES (${placeholders})
      ON CONFLICT (user_id, id) DO UPDATE SET
        ${updates},
        updated_at_ms = excluded.updated_at_ms,
        deleted_at = excluded.deleted_at
      WHERE excluded.updated_at_ms > ${table}.updated_at_ms`;

    const statement = this.db.prepare(sql);
    const readColumns = syncSelectColumns(table);
    const merged: SqlRow[] = [];

    for (let offset = 0; offset < rows.length; offset += UPSERT_CHUNK) {
      const chunk = rows.slice(offset, offset + UPSERT_CHUNK);
      const statements = chunk.map(row =>
        statement.bind(
          userId,
          row.id,
          ...row.values,
          row.updatedAtMs,
          row.deletedAt,
          ...row.sent.map(sent => (sent ? 1 : 0)),
        ),
      );

      const readbackFrom = statements.length;
      for (let i = 0; i < chunk.length; i += READBACK_CHUNK) {
        const ids = chunk.slice(i, i + READBACK_CHUNK).map(row => row.id);
        statements.push(
          this.db
            .prepare(
              `SELECT ${readColumns} FROM ${table}
               WHERE user_id = ? AND id IN (${ids.map(() => '?').join(', ')})`,
            )
            .bind(userId, ...ids),
        );
      }

      const batches = await this.db.batch(statements);
      for (const batch of batches.slice(readbackFrom)) {
        merged.push(...batch.results);
      }
    }

    await this.db
      .prepare(
        `UPDATE users SET last_synced_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ?`,
      )
      .bind(userId)
      .run();

    return merged;
  }

  batch(statements: Statement[]): Promise<{ results: SqlRow[] }[]> {
    return this.db.batch(statements);
  }
}
