import type { Client } from '@libsql/client';
import { beforeEach, describe, expect, test } from 'vitest';
import { mediaKey, UNREFERENCED_MEDIA_TTL_MS, utcDay } from '../src/media';
import { SyncRepo } from '../src/repo';
import { sweepUnreferencedMedia } from '../src/scheduled/sweepUnreferencedMedia';
import { stubBucket } from './__fixtures__/mediaBucket.fixture';
import { migratedDb } from './sqlite-db';

const NOW = Date.parse('2026-11-19T12:00:00.000Z');
const OLD = new Date(NOW - UNREFERENCED_MEDIA_TTL_MS - 1000).toISOString();
const RECENT = new Date(NOW - 1000).toISOString();

let client: Client;
let repo: SyncRepo;
let userId: string;

beforeEach(async () => {
  const migrated = await migratedDb();
  client = migrated.client;
  repo = new SyncRepo(migrated.db);
  userId = await repo.ensureUserId('k'.repeat(64));
});

async function addObject(basename: string, createdAt: string): Promise<void> {
  await client.execute({
    sql: `INSERT INTO media_objects (user_id, basename, bytes, created_at)
          VALUES (?, ?, 10, ?)`,
    args: [userId, basename, createdAt],
  });
}

async function addReference(basename: string): Promise<void> {
  await client.execute({
    sql: `INSERT INTO catch_media (user_id, id, catch_id, basename, updated_at_ms)
          VALUES (?, ?, 'c1', ?, 1)`,
    args: [userId, `m-${basename}`, basename],
  });
}

async function remainingBasenames(): Promise<string[]> {
  const result = await client.execute(
    'SELECT basename FROM media_objects ORDER BY basename',
  );
  return result.rows.map(row => row['basename'] as string);
}

describe('sweepUnreferencedMedia', () => {
  test('deletes only old objects that no catch_media row names', async () => {
    await addObject('old-orphan.jpg', OLD);
    await addObject('old-used.jpg', OLD);
    await addObject('new-orphan.jpg', RECENT);
    await addReference('old-used.jpg');
    const store = stubBucket();

    expect(await sweepUnreferencedMedia(repo, store.bucket, NOW)).toBe(1);

    expect(await remainingBasenames()).toEqual([
      'new-orphan.jpg',
      'old-used.jpg',
    ]);

    expect(store.deleted).toEqual([mediaKey(userId, 'old-orphan.jpg')]);
  });

  test('puts the rows back when the R2 delete fails', async () => {
    await addObject('old-orphan.jpg', OLD);
    const before = await client.execute('SELECT * FROM media_objects');

    expect(
      await sweepUnreferencedMedia(
        repo,
        stubBucket({ failDelete: true }).bucket,
        NOW,
      ),
    ).toBe(0);

    const after = await client.execute('SELECT * FROM media_objects');
    expect(after.rows).toEqual(before.rows);
  });

  test('prunes upload budget rows from before yesterday', async () => {
    const day = 24 * 60 * 60 * 1000;
    for (const offset of [0, 1, 2]) {
      await repo.reserveUploadBudget(utcDay(NOW - offset * day), 'ip', 1, 10);
    }

    await sweepUnreferencedMedia(repo, stubBucket().bucket, NOW);

    const result = await client.execute(
      'SELECT day FROM media_upload_budget ORDER BY day',
    );
    expect(result.rows.map(row => row['day'] as string)).toEqual([
      utcDay(NOW - day),
      utcDay(NOW),
    ]);
  });
});
