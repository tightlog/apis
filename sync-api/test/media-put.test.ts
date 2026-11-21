import { workerFetch } from '@tightlog/worker-utils/worker/fetch';
import { getPlatformProxy } from 'wrangler';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from 'vitest';
import { handleMediaPut } from '../src/handlers/media/handleMediaPut';
import { mediaWriter } from '../src/handlers/media/mediaCaller';
import { SyncRepo } from '../src/repo';
import { SYNC_MEDIA_QUOTA_BYTES } from '../src/http';
import type { Env } from '../src/types';
import { migratedDb } from './sqlite-db';

vi.mock('../src/handlers/media/mediaCaller', () => ({
  mediaWriter: vi.fn(),
}));

const HELLO_SHA256 =
  '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824';

const env: Env = { TURSO_DATABASE_URL: 'unused', SENTRY_ENVIRONMENT: 'test' };

let proxy: Awaited<ReturnType<typeof getPlatformProxy<{ MEDIA: R2Bucket }>>>;
let repo: SyncRepo;
let userId: string;

beforeAll(async () => {
  proxy = await getPlatformProxy<{ MEDIA: R2Bucket }>({
    environment: 'staging',
    persist: false,
  });
}, 60_000);

afterAll(async () => {
  await proxy.dispose();
});

beforeEach(async () => {
  repo = new SyncRepo((await migratedDb()).db);
  userId = await repo.ensureUserId('a'.repeat(64));
});

function bufferedBucket(): R2Bucket {
  const bucket = proxy.env.MEDIA;
  return {
    ...bucket,
    // workerd knows the length of a request body and R2 needs it. A Node
    // Request body stream has no length, so read it first.
    put: async (key, value, options) =>
      bucket.put(key, await new Response(value).arrayBuffer(), options),
  };
}

function useBucket(bucket: R2Bucket): void {
  vi.mocked(mediaWriter).mockResolvedValue({ userId, bucket, repo });
}

const put = workerFetch<Env>(
  request =>
    handleMediaPut(request, env, new URL(request.url).pathname.slice(1)),
  { name: 'sync-api' },
);

async function upload(basename: string): Promise<{
  status: number;
  body: unknown;
}> {
  const response = await put(
    new Request(`https://sync.test/${basename}`, {
      method: 'PUT',
      headers: { 'content-length': '5' },
      body: 'hello',
    }),
    env,
    // SAFETY: the handler does not use the execution context.
    {} as ExecutionContext,
  );
  return { status: response.status, body: await response.json() };
}

describe('handleMediaPut', () => {
  test('stores a body that matches its basename', async () => {
    useBucket(bufferedBucket());
    expect(await upload(`${HELLO_SHA256}.jpg`)).toEqual({
      status: 200,
      body: { basename: `${HELLO_SHA256}.jpg`, bytes: 5 },
    });
  });

  test('refuses a body that does not match its basename', async () => {
    useBucket(bufferedBucket());
    expect(await upload(`${'0'.repeat(64)}.jpg`)).toEqual({
      status: 422,
      body: { error: 'checksum_mismatch' },
    });
  });

  test('reports any other R2 failure as a server error', async () => {
    useBucket({
      ...proxy.env.MEDIA,
      put: () =>
        Promise.reject(
          new Error(
            'put: We encountered an internal error. Please try again. (10001)',
          ),
        ),
    });
    expect(await upload(`${HELLO_SHA256}.jpg`)).toEqual({
      status: 500,
      body: { error: 'internal_error' },
    });
  });

  test('refuses a new file that takes the account over the byte quota', async () => {
    useBucket(bufferedBucket());
    await repo.upsertMediaObject(userId, {
      basename: `${'1'.repeat(64)}.jpg`,
      bytes: SYNC_MEDIA_QUOTA_BYTES - 4,
      contentType: 'image/jpeg',
    });

    expect(await upload(`${HELLO_SHA256}.jpg`)).toEqual({
      status: 413,
      body: { error: 'media_quota_bytes' },
    });
  });
});
