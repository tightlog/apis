import { beforeAll, describe, expect, test } from 'vitest';
import { sha256HexOfText } from '@tightlog/worker-utils/utils/sha256';
import {
  decryptKeyEscrow,
  encryptKeyEscrow,
  EscrowMismatchError,
  EscrowSecretError,
  isEscrowSecret,
} from '../src/key-escrow';
import type { EscrowBinding } from '../src/key-escrow';

const SECRET = Buffer.from('a'.repeat(32)).toString('base64');
const OTHER_SECRET = Buffer.from('b'.repeat(32)).toString('base64');
const SHORT_SECRET = Buffer.from('a'.repeat(16)).toString('base64');
const SYNC_KEY = `logbook-key-${'c'.repeat(64)}`;
const OTHER_KEY = `logbook-key-${'d'.repeat(64)}`;

let binding: EscrowBinding;
let otherBinding: EscrowBinding;

beforeAll(async () => {
  binding = { userId: 'user-1', keyHash: await sha256HexOfText(SYNC_KEY) };
  otherBinding = {
    userId: 'user-2',
    keyHash: await sha256HexOfText(OTHER_KEY),
  };
});

async function legacyEscrow(secret: string, syncKey: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    Buffer.from(secret, 'base64'),
    'AES-GCM',
    false,
    ['encrypt'],
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(syncKey),
  );
  return `${Buffer.from(iv).toString('base64')}.${Buffer.from(ciphertext).toString('base64')}`;
}

describe('key escrow encryption', () => {
  test('round-trips the sync key under the same secret and binding', async () => {
    const escrowed = await encryptKeyEscrow(SECRET, SYNC_KEY, binding);
    expect(await decryptKeyEscrow(SECRET, escrowed, binding)).toBe(SYNC_KEY);
  });

  test('two encryptions of the same key produce different ciphertext', async () => {
    const first = await encryptKeyEscrow(SECRET, SYNC_KEY, binding);
    const second = await encryptKeyEscrow(SECRET, SYNC_KEY, binding);
    expect(first).not.toBe(second);
  });

  test('fails to decrypt under the wrong secret', async () => {
    const escrowed = await encryptKeyEscrow(SECRET, SYNC_KEY, binding);
    await expect(
      decryptKeyEscrow(OTHER_SECRET, escrowed, binding),
    ).rejects.toThrow();
  });

  test('rejects a malformed stored value', async () => {
    await expect(
      decryptKeyEscrow(SECRET, 'not-a-valid-value', binding),
    ).rejects.toThrow('malformed key escrow value');
  });

  test('refuses a ciphertext moved to another user row', async () => {
    const escrowed = await encryptKeyEscrow(SECRET, SYNC_KEY, binding);
    await expect(
      decryptKeyEscrow(SECRET, escrowed, { ...binding, userId: 'user-2' }),
    ).rejects.toThrow();
  });

  test('refuses a ciphertext left behind after the row was rekeyed', async () => {
    const escrowed = await encryptKeyEscrow(SECRET, SYNC_KEY, binding);
    await expect(
      decryptKeyEscrow(SECRET, escrowed, {
        ...binding,
        keyHash: otherBinding.keyHash,
      }),
    ).rejects.toThrow();
  });

  test('still opens an unbound ciphertext when the key matches the row hash', async () => {
    const escrowed = await legacyEscrow(SECRET, SYNC_KEY);
    expect(await decryptKeyEscrow(SECRET, escrowed, binding)).toBe(SYNC_KEY);
  });

  test('refuses an unbound ciphertext whose key does not match the row hash', async () => {
    const escrowed = await legacyEscrow(SECRET, OTHER_KEY);
    await expect(
      decryptKeyEscrow(SECRET, escrowed, binding),
    ).rejects.toBeInstanceOf(EscrowMismatchError);
  });
});

describe('escrow secret', () => {
  test('accepts only a base64-encoded 32-byte key', () => {
    expect(isEscrowSecret(SECRET)).toBe(true);

    expect(isEscrowSecret(SHORT_SECRET)).toBe(false);

    expect(isEscrowSecret('not base64 at all')).toBe(false);
  });

  test('encryption refuses a secret of the wrong length', async () => {
    await expect(
      encryptKeyEscrow(SHORT_SECRET, SYNC_KEY, binding),
    ).rejects.toBeInstanceOf(EscrowSecretError);
  });
});
