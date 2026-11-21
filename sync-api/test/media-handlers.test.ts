import type { Client } from '@libsql/client';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  mediaQuotaExceeded,
  SYNC_MEDIA_QUOTA_BYTES,
  SYNC_MEDIA_QUOTA_OBJECTS,
} from '../src/http';
import { sha256HexOfText } from '@tightlog/worker-utils/utils/sha256';
import type { MediaStatusResponse, MediaUsage } from '../src/http';
import type { Db } from '@tightlog/worker-utils/services/libsql';
import { handleMediaGet } from '../src/handlers/media/handleMediaGet';
import { handleMediaPut } from '../src/handlers/media/handleMediaPut';
import { handleMediaStatus } from '../src/handlers/media/handleMediaStatus';
import { MAX_IP_DAILY_UPLOAD_BYTES, utcDay } from '../src/media';
import { SyncRepo } from '../src/repo';
import { stubBucket } from './__fixtures__/mediaBucket.fixture';
import type { StubBucket } from './__fixtures__/mediaBucket.fixture';
import {
  jsonRequest,
  keyHashOf,
  syncKey,
  syncRequest,
  testEnv,
} from './__fixtures__/syncRequest.fixture';
import { migratedDb } from './sqlite-db';

const holder = vi.hoisted(() => ({ db: null as Db | null }));

vi.mock('../src/db', () => ({
  getDb: () => holder.db,
}));

const KEY = syncKey('1');
const OTHER_KEY = syncKey('2');
const IP = '203.0.113.7';
const BODY = new TextEncoder().encode('photo bytes');

let client: Client;
let repo: SyncRepo;
let store: StubBucket;
let basename: string;

beforeEach(async () => {
  const migrated = await migratedDb();
  client = migrated.client;
  holder.db = migrated.db;
  repo = new SyncRepo(migrated.db);
  store = stubBucket();
  basename = `${await keyHashOf(new TextDecoder().decode(BODY))}.jpg`;
});

function put(key: string, bucket: R2Bucket = store.bucket): Promise<Response> {
  return handleMediaPut(
    syncRequest(`/v1/sync/media/${basename}`, {
      key,
      method: 'PUT',
      body: BODY,
      headers: {
        'content-length': String(BODY.byteLength),
        'cf-connecting-ip': IP,
      },
    }),
    testEnv({ MEDIA: bucket }),
    basename,
  );
}

async function userCount(): Promise<number> {
  const result = await client.execute('SELECT COUNT(*) FROM users');
  return Number(result.rows[0]?.[0] ?? 0);
}

async function mediaRows(): Promise<{ basename: string; committed: number }[]> {
  const result = await client.execute(
    'SELECT basename, committed FROM media_objects ORDER BY basename',
  );
  return result.rows.map(row => ({
    basename: row['basename'] as string,
    committed: Number(row['committed']),
  }));
}

async function budgetBytes(): Promise<number> {
  const result = await client.execute({
    sql: 'SELECT bytes FROM media_upload_budget WHERE day = ? AND ip_hash = ?',
    args: [utcDay(Date.now()), await sha256HexOfText(IP)],
  });
  return Number(result.rows[0]?.[0] ?? 0);
}

async function fillQuota(key: string, bytes: number): Promise<void> {
  const userId = await repo.ensureUserId(await keyHashOf(key));
  await repo.upsertMediaObject(userId, {
    basename: `${'f'.repeat(64)}.jpg`,
    bytes,
    contentType: 'image/jpeg',
  });
}

describe('PUT /v1/sync/media/:basename', () => {
  test('stores the object and commits its row', async () => {
    const response = await put(KEY);

    expect(response.status).toBe(200);

    expect(await mediaRows()).toEqual([{ basename, committed: 1 }]);

    expect(await budgetBytes()).toBe(BODY.byteLength);
  });

  test('a full byte quota refuses the upload before the bucket write', async () => {
    await fillQuota(KEY, SYNC_MEDIA_QUOTA_BYTES);
    const response = await put(KEY);

    expect(response.status).toBe(413);

    expect(await response.json()).toEqual({ error: 'media_quota_bytes' });

    expect(store.objects.size).toBe(0);
  });

  test('the reservation counts objects, not only bytes', async () => {
    const userId = await repo.ensureUserId(await keyHashOf(KEY));
    for (let i = 0; i < SYNC_MEDIA_QUOTA_OBJECTS; i++) {
      await client.execute({
        sql: 'INSERT INTO media_objects (user_id, basename, bytes) VALUES (?, ?, 1)',
        args: [userId, `${i.toString(16).padStart(64, '0')}.jpg`],
      });
    }

    const response = await put(KEY);

    expect(await response.json()).toEqual({ error: 'media_quota_objects' });
  });

  test('the per-IP daily budget covers every key from that address', async () => {
    await repo.reserveUploadBudget(
      utcDay(Date.now()),
      await sha256HexOfText(IP),
      MAX_IP_DAILY_UPLOAD_BYTES - 1,
      MAX_IP_DAILY_UPLOAD_BYTES,
    );

    const response = await put(OTHER_KEY);

    expect(response.status).toBe(429);

    expect(await response.json()).toEqual({ error: 'media_quota_daily' });

    expect(await mediaRows()).toEqual([]);

    expect(store.objects.size).toBe(0);
  });

  test('a failed bucket write releases the reservation and refunds the budget', async () => {
    const response = await put(KEY, stubBucket({ failPut: true }).bucket);

    expect(response.status).toBe(422);

    expect(await mediaRows()).toEqual([]);

    expect(await budgetBytes()).toBe(0);
  });

  test('a second upload of the same object does not need new quota', async () => {
    await put(KEY);
    await fillQuota(KEY, SYNC_MEDIA_QUOTA_BYTES);

    expect((await put(KEY)).status).toBe(200);
  });
});

describe('SyncRepo.reserveMediaObject', () => {
  test('two reservations that each fit cannot together pass the cap', async () => {
    const userId = await repo.ensureUserId(await keyHashOf(KEY));
    const quota = { maxBytes: 100, maxObjects: 10 };
    const results = await Promise.all([
      repo.reserveMediaObject(
        userId,
        { basename: 'a.jpg', bytes: 60, contentType: 'image/jpeg' },
        quota,
      ),
      repo.reserveMediaObject(
        userId,
        { basename: 'b.jpg', bytes: 60, contentType: 'image/jpeg' },
        quota,
      ),
    ]);

    expect(results.filter(Boolean)).toHaveLength(1);

    expect(await repo.mediaUsage(userId)).toEqual({ bytes: 60, objects: 1 });
  });

  test('the SQL cap agrees with mediaQuotaExceeded at each boundary', async () => {
    const cases: { usage: MediaUsage; added: number }[] = [
      { usage: { objects: 0, bytes: 0 }, added: 1 },
      { usage: { objects: SYNC_MEDIA_QUOTA_OBJECTS - 1, bytes: 0 }, added: 1 },
      { usage: { objects: SYNC_MEDIA_QUOTA_OBJECTS, bytes: 0 }, added: 1 },
      { usage: { objects: 1, bytes: SYNC_MEDIA_QUOTA_BYTES - 10 }, added: 10 },
      { usage: { objects: 1, bytes: SYNC_MEDIA_QUOTA_BYTES - 10 }, added: 11 },
    ];
    const verdicts = [];
    for (const [index, { usage, added }] of cases.entries()) {
      const userId = await repo.ensureUserId(String(index).repeat(64));
      if (usage.objects > 0) {
        await client.execute({
          sql: `WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < ?2)
                INSERT INTO media_objects (user_id, basename, bytes, content_type, committed)
                SELECT ?1, printf('%064x.jpg', i), CASE WHEN i = 1 THEN ?3 ELSE 0 END, 'image/jpeg', 1
                FROM n`,
          args: [userId, usage.objects, usage.bytes],
        });
      }

      verdicts.push({
        sql: await repo.reserveMediaObject(
          userId,
          { basename: 'new.jpg', bytes: added, contentType: 'image/jpeg' },
          {
            maxBytes: SYNC_MEDIA_QUOTA_BYTES,
            maxObjects: SYNC_MEDIA_QUOTA_OBJECTS,
          },
        ),
        helper: mediaQuotaExceeded(usage, added) === null,
      });
    }

    expect(verdicts).toEqual([
      { sql: true, helper: true },
      { sql: true, helper: true },
      { sql: false, helper: false },
      { sql: true, helper: true },
      { sql: false, helper: false },
    ]);
  });
});

describe('read-only media requests', () => {
  test('GET with an unknown key is a 404 and creates no user', async () => {
    const response = await handleMediaGet(
      syncRequest(`/v1/sync/media/${basename}`, { key: KEY, method: 'GET' }),
      testEnv({ MEDIA: store.bucket }),
      basename,
    );

    expect(response.status).toBe(404);

    expect(await userCount()).toBe(0);
  });

  test('status with an unknown key reports every name missing and creates no user', async () => {
    const response = await handleMediaStatus(
      jsonRequest('/v1/sync/media/status', KEY, { names: [basename] }),
      testEnv({ MEDIA: store.bucket }),
    );

    expect(await response.json()).toEqual<MediaStatusResponse>({
      missing: [basename],
      usage: { bytes: 0, objects: 0 },
    });

    expect(await userCount()).toBe(0);
  });

  test('status reports a reserved but unwritten object as missing', async () => {
    const userId = await repo.ensureUserId(await keyHashOf(KEY));
    await repo.reserveMediaObject(
      userId,
      { basename, bytes: 1, contentType: 'image/jpeg' },
      {
        maxBytes: SYNC_MEDIA_QUOTA_BYTES,
        maxObjects: SYNC_MEDIA_QUOTA_OBJECTS,
      },
    );

    const response = await handleMediaStatus(
      jsonRequest('/v1/sync/media/status', KEY, { names: [basename] }),
      testEnv({ MEDIA: store.bucket }),
    );

    expect(await response.json()).toEqual<MediaStatusResponse>({
      missing: [basename],
      usage: { bytes: 1, objects: 1 },
    });
  });
});
