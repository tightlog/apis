import { describe, expect, test } from 'vitest';
import { SYNC_ROW_FIELDS } from '../src/http';
import type { SyncTableName } from '../src/http';

const APP_1_0_15_ROW_KEYS = {
  spots: ['name', 'waterType', 'latitude', 'longitude', 'notes', 'createdAt'],
  sessions: [
    'name',
    'startedAt',
    'endedAt',
    'notes',
    'rodCount',
    'setup',
    'createdAt',
  ],
  catches: [
    'species',
    'weightKg',
    'lengthCm',
    'caughtAt',
    'spotId',
    'sessionId',
    'method',
    'weather',
    'airTempC',
    'windKph',
    'pressureHpa',
    'latitude',
    'longitude',
    'released',
    'landed',
    'pinned',
    'bait',
    'hookBait',
    'peg',
    'swim',
    'rigId',
    'notes',
    'createdAt',
  ],
  catch_media: ['catchId', 'basename', 'kind', 'position', 'createdAt'],
} satisfies Record<SyncTableName, string[]>;

const CATCH_KEYS_BY_GROUP = {
  'iOS 1.0.0': APP_1_0_15_ROW_KEYS.catches.filter(
    key => !['peg', 'swim', 'rigId'].includes(key),
  ),
  'iOS 1.0.1 to 1.0.13 and Android 1.0.0 to 1.0.1':
    APP_1_0_15_ROW_KEYS.catches.filter(key => !['peg', 'swim'].includes(key)),
  'iOS 1.0.14 to 1.0.15 and Android 1.0.2 to 1.0.3':
    APP_1_0_15_ROW_KEYS.catches,
};

describe('catch rows from every old app', () => {
  test.each(Object.entries(CATCH_KEYS_BY_GROUP))(
    'the server stores every catch field %s sends',
    (_group, keys) => {
      const known = Object.keys(SYNC_ROW_FIELDS.catches);

      expect(keys.filter(key => !known.includes(key))).toEqual([]);
    },
  );
});

describe('rows exactly as app 1.0.15 pushes them', () => {
  test.each(Object.keys(APP_1_0_15_ROW_KEYS) as SyncTableName[])(
    'the server still stores every %s field the old app sends',
    table => {
      const known = Object.keys(SYNC_ROW_FIELDS[table]);

      expect(
        APP_1_0_15_ROW_KEYS[table].filter(key => !known.includes(key)),
      ).toEqual([]);
    },
  );
});
