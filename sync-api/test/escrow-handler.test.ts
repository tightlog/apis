import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { Db } from '@tightlog/worker-utils/services/libsql';
import { handleEscrowKey } from '../src/handlers/escrow/handleEscrowKey';
import { decryptKeyEscrow } from '../src/key-escrow';
import { SyncRepo } from '../src/repo';
import {
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

const KEY = syncKey('e');
const SECRET = Buffer.from('s'.repeat(32)).toString('base64');

let repo: SyncRepo;

beforeEach(async () => {
  const migrated = await migratedDb();
  holder.db = migrated.db;
  repo = new SyncRepo(migrated.db);
});

function escrow(secret: string): Promise<Response> {
  return handleEscrowKey(
    syncRequest('/v1/sync/escrow-key', { key: KEY }),
    testEnv({ KEY_ESCROW_SECRET: secret }),
  );
}

describe('POST /v1/sync/escrow-key', () => {
  test('a secret that is not 32 bytes reads as not configured', async () => {
    const response = await escrow(Buffer.from('short').toString('base64'));

    expect(response.status).toBe(501);

    expect(await response.json()).toEqual({ error: 'not_configured' });
  });

  test('stores a ciphertext bound to the user row and key hash', async () => {
    const response = await escrow(SECRET);
    expect(response.status).toBe(200);

    const keyHash = await keyHashOf(KEY);
    const user = await repo.getOrCreateUser(keyHash);

    expect(
      await decryptKeyEscrow(SECRET, user.keyEscrow ?? '', {
        userId: user.id,
        keyHash,
      }),
    ).toBe(KEY);

    await expect(
      decryptKeyEscrow(SECRET, user.keyEscrow ?? '', {
        userId: 'another-user',
        keyHash,
      }),
    ).rejects.toThrow();
  });
});
