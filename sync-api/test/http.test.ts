import { describe, expect, test } from 'vitest';
import {
  adoptPurchaseChallenge,
  isSyncIdentityId,
  isSyncKey,
  isSyncTableName,
  SYNC_KEY_BYTES,
  syncKeyFromBytes,
} from '../src/http';
import { isRevenueCatAppUserId } from '../src/revenuecat';

describe('sync', () => {
  test('a sync identity id is 64 lowercase hex characters', () => {
    expect(isSyncIdentityId('a'.repeat(64))).toBe(true);

    expect(isSyncIdentityId('A'.repeat(64))).toBe(false);

    expect(isSyncIdentityId('a'.repeat(63))).toBe(false);
  });

  test('a sync key is the prefix and 64 hex characters', () => {
    expect(isSyncKey(`logbook-key-${'a'.repeat(64)}`)).toBe(true);

    expect(isSyncKey(`logbook-key-${'A'.repeat(64)}`)).toBe(false);

    expect(isSyncKey(`logbook-key-${'a'.repeat(63)}`)).toBe(false);

    expect(isSyncKey('a'.repeat(64))).toBe(false);
  });

  test('a key built from random bytes is a sync key', () => {
    expect(
      isSyncKey(syncKeyFromBytes(new Uint8Array(SYNC_KEY_BYTES).fill(0xab))),
    ).toBe(true);

    expect(
      isSyncKey(syncKeyFromBytes(new Uint8Array(SYNC_KEY_BYTES - 1))),
    ).toBe(false);
  });

  test('only the synced logbook tables are sync tables', () => {
    expect(
      ['catches', 'spots', 'sessions', 'catch_media'].every(isSyncTableName),
    ).toBe(true);

    expect(
      ['users', 'media_objects', '', 'constructor'].some(isSyncTableName),
    ).toBe(false);
  });

  test('the adopt-purchase challenge binds the route, the customer and the key', () => {
    expect(adoptPurchaseChallenge('$RCAnonymousID:abc', 'k'.repeat(64))).toBe(
      `POST\n/v1/sync/adopt-purchase\n$RCAnonymousID:abc\n${'k'.repeat(64)}`,
    );
  });
});

describe('revenuecat', () => {
  test('accepts the app user ids RevenueCat mints', () => {
    expect(
      isRevenueCatAppUserId('$RCAnonymousID:8f3c2b1a4d5e6f708192a3b4c5d6e7f8'),
    ).toBe(true);

    expect(isRevenueCatAppUserId('user_2abc.DEF-123@example.com')).toBe(true);
  });

  test('rejects an id that could steer the lookup elsewhere', () => {
    expect(
      [
        '../subscribers/someone-else',
        'has space',
        'short',
        'a'.repeat(129),
        '',
      ].some(isRevenueCatAppUserId),
    ).toBe(false);
  });
});
