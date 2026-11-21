import type { MediaStatusResponse } from '../src/http';
import { workerFetch } from '@tightlog/worker-utils/worker/fetch';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { handleMediaStatus } from '../src/handlers/media/handleMediaStatus';
import { mediaReader } from '../src/handlers/media/mediaCaller';
import { SyncRepo } from '../src/repo';
import type { Env } from '../src/types';
import { migratedDb } from './sqlite-db';

vi.mock('../src/handlers/media/mediaCaller', () => ({
  mediaReader: vi.fn(),
}));

const env: Env = { TURSO_DATABASE_URL: 'unused', SENTRY_ENVIRONMENT: 'test' };

const stored = `${'1'.repeat(64)}.jpg`;
const absent = `${'2'.repeat(64)}.jpg`;

beforeEach(async () => {
  const repo = new SyncRepo((await migratedDb()).db);
  const userId = await repo.ensureUserId('a'.repeat(64));
  await repo.upsertMediaObject(userId, {
    basename: stored,
    bytes: 1234,
    contentType: 'image/jpeg',
  });
  vi.mocked(mediaReader).mockResolvedValue({
    userId,
    // SAFETY: the status handler does not touch the bucket.
    bucket: {} as R2Bucket,
    repo,
  });
});

const status = workerFetch<Env>(request => handleMediaStatus(request, env), {
  name: 'sync-api',
});

describe('handleMediaStatus', () => {
  test('lists the missing names and the stored usage', async () => {
    const response = await status(
      new Request('https://sync.test/v1/sync/media/status', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ names: [stored, absent] }),
      }),
      env,
      // SAFETY: the handler does not use the execution context.
      {} as ExecutionContext,
    );

    expect(await response.json()).toEqual<MediaStatusResponse>({
      missing: [absent],
      usage: { bytes: 1234, objects: 1 },
    });
  });
});
