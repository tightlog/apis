import type { Client } from '@libsql/client';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { Db } from '@tightlog/worker-utils/services/libsql';
import { handleAdoptPurchase } from '../src/handlers/adopt/handleAdoptPurchase';
import { handleRecoveryNoticesPull } from '../src/handlers/recovery/handleRecoveryNoticesPull';
import { SyncRepo } from '../src/repo';
import { catchRow } from './__fixtures__/catchRow.fixture';
import {
  jsonRequest,
  keyHashOf,
  recordingLimiter,
  syncKey,
  syncRequest,
  testEnv,
} from './__fixtures__/syncRequest.fixture';
import { migratedDb } from './sqlite-db';

const holder = vi.hoisted(() => ({ db: null as Db | null }));

vi.mock('../src/db', () => ({
  getDb: () => holder.db,
}));

const VICTIM_KEY = syncKey('a');
const CALLER_KEY = syncKey('b');
const TRANSACTION = 'txn-1';

let client: Client;
let repo: SyncRepo;
let victimHash: string;
let callerHash: string;
let victimId: string;

const subscriber = {
  subscriber: {
    entitlements: {
      'fish-logbook Pro': { expires_date: '2999-01-01T00:00:00Z' },
    },
    subscriptions: {
      pro: {
        expires_date: '2999-01-01T00:00:00Z',
        store_transaction_id: TRANSACTION,
      },
    },
  },
};

const fetchStub = vi.fn(() =>
  Promise.resolve(new Response(JSON.stringify(subscriber), { status: 200 })),
);

beforeEach(async () => {
  const migrated = await migratedDb();
  client = migrated.client;
  holder.db = migrated.db;
  repo = new SyncRepo(migrated.db);
  victimHash = await keyHashOf(VICTIM_KEY);
  callerHash = await keyHashOf(CALLER_KEY);

  await repo.upsertRows('catches', victimHash, [catchRow('c1', 1000)]);
  const victim = await repo.getOrCreateUser(victimHash);
  victimId = victim.id;
  await repo.claimRevenueCatId(victimId, victimHash).run();
  await repo.setKeyEscrow(victimId, 'v2.iv.ciphertext').run();

  fetchStub.mockClear();
  vi.stubGlobal('fetch', fetchStub);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function purchaseEnv(limiter = recordingLimiter()) {
  return testEnv({
    REVENUECAT_SECRET_KEY: 'sk_test',
    REVENUECAT_ENTITLEMENT_IDS: 'fish-logbook Pro',
    ADOPT_RATE_LIMITER: limiter,
  });
}

function adoptPurchase(env = purchaseEnv()): Promise<Response> {
  return handleAdoptPurchase(
    jsonRequest('/v1/sync/adopt-purchase', CALLER_KEY, {
      appUserId: victimHash,
      storeTransactionId: TRANSACTION,
    }),
    env,
  );
}

async function noticesFor(key: string): Promise<{ kind: string }[]> {
  const response = await handleRecoveryNoticesPull(
    syncRequest('/v1/sync/recovery-notices', { key, method: 'GET' }),
    testEnv(),
  );
  const body: { items: { kind: string }[] } = await response.json();
  return body.items.map(item => ({ kind: item.kind }));
}

async function victimRow(): Promise<{
  keyHash: string;
  keyEscrow: unknown;
  keyEscrowUpdatedAt: unknown;
}> {
  const result = await client.execute({
    sql: 'SELECT key_hash, key_escrow, key_escrow_updated_at FROM users WHERE id = ?',
    args: [victimId],
  });
  const row = result.rows[0];
  return {
    keyHash: row?.['key_hash'] as string,
    keyEscrow: row?.['key_escrow'],
    keyEscrowUpdatedAt: row?.['key_escrow_updated_at'],
  };
}

describe('POST /v1/sync/adopt-purchase', () => {
  test('a limited appUserId never reaches RevenueCat', async () => {
    const limiter = recordingLimiter(new Set([victimHash]));
    const response = await adoptPurchase(purchaseEnv(limiter));

    expect(response.status).toBe(429);

    expect(fetchStub).not.toHaveBeenCalled();

    expect(limiter.keys).toEqual([callerHash, victimHash]);
  });

  test('a rekey clears the escrowed key that belongs to the previous key', async () => {
    const response = await adoptPurchase();

    expect(response.status).toBe(200);

    expect(await victimRow()).toEqual({
      keyHash: callerHash,
      keyEscrow: null,
      keyEscrowUpdatedAt: null,
    });
  });

  test('a rekey leaves an account_relinked notice for the previous key only', async () => {
    await adoptPurchase();

    expect(await noticesFor(VICTIM_KEY)).toEqual([
      { kind: 'account_relinked' },
    ]);

    expect(await noticesFor(CALLER_KEY)).toEqual([]);
  });

  test('the previous key can acknowledge its notice', async () => {
    await adoptPurchase();
    const [notice] = await repo.listUnreadRecoveryNotices(victimHash);
    await repo.markRecoveryNoticesRead(victimHash, [notice?.id ?? '']).run();

    expect(await noticesFor(VICTIM_KEY)).toEqual([]);
  });

  test('a refused purchase writes no notice and keeps the key', async () => {
    fetchStub.mockImplementationOnce(() =>
      Promise.resolve(new Response('{}', { status: 404 })),
    );
    const response = await adoptPurchase();

    expect(response.status).toBe(404);

    expect(await noticesFor(VICTIM_KEY)).toEqual([]);

    expect((await victimRow()).keyHash).toBe(victimHash);
  });
});
