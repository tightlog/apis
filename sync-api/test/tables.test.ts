import { describe, expect, test } from 'vitest';
import type { SqlRow } from '@tightlog/worker-utils/services/libsql';
import type { SyncTableName, SyncTableRow } from '../src/http';
import { SYNC_TEXT_MAX } from '../src/http';
import type { SanitizedRow } from '../src/tables';
import {
  dataColumns,
  MAX_FUTURE_SKEW_MS,
  sanitizeRow,
  syncRowFromDb,
  syncRowSchema,
} from '../src/tables';

type ColumnValues = Record<string, SanitizedRow['values'][number]>;

function byColumn(
  table: SyncTableName,
  row: SanitizedRow | null,
): ColumnValues {
  const columns = dataColumns(table);
  return Object.fromEntries(
    (row?.values ?? []).map((value, i) => [columns[i] ?? `#${i}`, value]),
  );
}

describe('sanitizeRow', () => {
  test('rejects rows without usable data', () => {
    expect(sanitizeRow('catches', syncRowSchema.parse(null))).toBeNull();

    expect(sanitizeRow('catches', syncRowSchema.parse('nope'))).toBeNull();

    expect(sanitizeRow('catches', {})).toBeNull();

    expect(sanitizeRow('catches', { id: 'a' })).toBeNull();

    expect(sanitizeRow('catches', { id: '', updatedAt: 5 })).toBeNull();

    expect(sanitizeRow('catches', { id: 'a', updatedAt: 0 })).toBeNull();

    expect(sanitizeRow('catches', { id: 'a', updatedAt: NaN })).toBeNull();
  });

  test('coerces a full catch row to DB column values', () => {
    const row = sanitizeRow('catches', {
      id: 'uuid-1',
      updatedAt: 1750000000000,
      deletedAt: null,
      species: 'Carp',
      weightKg: 9.5,
      lengthCm: null,
      caughtAt: '2026-07-01T10:00:00.000Z',
      spotId: 'spot-uuid',
      sessionId: null,
      method: 'feeder',
      weather: 'cloudy',
      airTempC: 18.2,
      windKph: 12,
      pressureHpa: 1013,
      latitude: 53.4084,
      longitude: -2.9916,
      released: true,
      landed: true,
      pinned: false,
      bait: 'boilie',
      hookBait: 'wafter',
      rigId: 'rig-uuid',
      notes: 'margin bite',
      createdAt: '2026-07-01T10:05:00.000Z',
    });
    expect({
      id: row?.id,
      updatedAtMs: row?.updatedAtMs,
      deletedAt: row?.deletedAt,
    }).toEqual({ id: 'uuid-1', updatedAtMs: 1750000000000, deletedAt: null });

    expect(byColumn('catches', row)).toEqual<ColumnValues>({
      species: 'Carp',
      weight_kg: 9.5,
      length_cm: null,
      caught_at: '2026-07-01T10:00:00.000Z',
      spot_id: 'spot-uuid',
      session_id: null,
      method: 'feeder',
      weather: 'cloudy',
      air_temp_c: 18.2,
      wind_kph: 12,
      pressure_hpa: 1013,
      latitude: 53.4084,
      longitude: -2.9916,
      released: 1,
      landed: 1,
      pinned: 0,
      bait: 'boilie',
      hook_bait: 'wafter',
      peg: '',
      swim: '',
      rig_uuid: 'rig-uuid',
      notes: 'margin bite',
      created_at: '2026-07-01T10:05:00.000Z',
    });
  });

  test('defends against wrongly-typed values', () => {
    const row = sanitizeRow(
      'catches',
      syncRowSchema.parse({
        id: 'uuid-2',
        updatedAt: 1750000000000.7,
        deletedAt: 42,
        species: 123,
        weightKg: 'heavy',
        released: 'yes',
        landed: undefined,
        pinned: 1,
      }),
    );
    expect(row).not.toBeNull();

    expect(row!.updatedAtMs).toBe(1750000000000);

    expect(row!.deletedAt).toBeNull();
    const values = byColumn('catches', row);

    expect([
      values['species'],
      values['weight_kg'],
      values['released'],
      values['landed'],
      values['pinned'],
    ]).toEqual(['', null, 0, 1, 0]);
  });

  test('keeps a deletedAt timestamp', () => {
    const row = sanitizeRow('spots', {
      id: 'spot-1',
      updatedAt: 10,
      deletedAt: '2026-07-20T00:00:00.000Z',
      name: 'Willow Lake',
    });
    expect(row!.deletedAt).toBe('2026-07-20T00:00:00.000Z');
  });

  test('caps an oversized deletedAt like every other synced string', () => {
    const row = sanitizeRow('spots', {
      id: 'spot-1',
      updatedAt: 10,
      deletedAt: 'x'.repeat(SYNC_TEXT_MAX + 1),
      name: 'y'.repeat(SYNC_TEXT_MAX + 1),
    });
    expect(row!.deletedAt).toHaveLength(SYNC_TEXT_MAX);

    expect(byColumn('spots', row)['name']).toHaveLength(SYNC_TEXT_MAX);
  });

  test('clamps a far-future updatedAt to the Worker clock (F1)', () => {
    const nowMs = 1_800_000_000_000;
    const tenYears = 10 * 365 * 24 * 60 * 60 * 1000;
    const row = sanitizeRow(
      'catches',
      { id: 'future', updatedAt: nowMs + tenYears },
      nowMs,
    );
    expect(row!.updatedAtMs).toBe(nowMs + MAX_FUTURE_SKEW_MS);
  });

  test('leaves an in-range updatedAt untouched when clamping (F1)', () => {
    const nowMs = 1_800_000_000_000;
    const row = sanitizeRow(
      'catches',
      { id: 'recent', updatedAt: nowMs - 5_000 },
      nowMs,
    );
    expect(row!.updatedAtMs).toBe(nowMs - 5_000);
  });

  test('does not clamp when no Worker clock is supplied', () => {
    const row = sanitizeRow('catches', {
      id: 'x',
      updatedAt: 9_999_999_999_999,
    });
    expect(row!.updatedAtMs).toBe(9_999_999_999_999);
  });
});

describe('syncRowFromDb', () => {
  test('maps a catches DB row back to a sync row', () => {
    const syncRow = syncRowFromDb('catches', {
      user_id: 'ignored',
      id: 'uuid-1',
      species: 'Carp',
      weight_kg: 9.5,
      length_cm: null,
      caught_at: '2026-07-01T10:00:00.000Z',
      spot_id: 'spot-uuid',
      session_id: null,
      method: 'feeder',
      weather: 'cloudy',
      air_temp_c: 18.2,
      wind_kph: 12,
      pressure_hpa: 1013,
      latitude: 53.4084,
      longitude: -2.9916,
      released: 1,
      landed: 1,
      pinned: 0,
      bait: 'boilie',
      hook_bait: 'wafter',
      rig_uuid: 'rig-uuid',
      notes: 'margin bite',
      created_at: '2026-07-01T10:05:00.000Z',
      updated_at_ms: 1750000000000,
      deleted_at: null,
    });
    expect(syncRow).toEqual<SyncTableRow<'catches'>>({
      id: 'uuid-1',
      updatedAt: 1750000000000,
      species: 'Carp',
      weightKg: 9.5,
      lengthCm: null,
      caughtAt: '2026-07-01T10:00:00.000Z',
      spotId: 'spot-uuid',
      sessionId: null,
      method: 'feeder',
      weather: 'cloudy',
      airTempC: 18.2,
      windKph: 12,
      pressureHpa: 1013,
      latitude: 53.4084,
      longitude: -2.9916,
      released: true,
      landed: true,
      pinned: false,
      bait: 'boilie',
      hookBait: 'wafter',
      peg: '',
      swim: '',
      rigId: 'rig-uuid',
      notes: 'margin bite',
      createdAt: '2026-07-01T10:05:00.000Z',
      deletedAt: null,
    });
  });

  test('round-trips sanitize -> db row -> sync row', () => {
    const input = {
      id: 'sess-1',
      updatedAt: 1750000000001,
      deletedAt: null,
      name: 'Dawn on the weir pool',
      startedAt: '2026-07-01T06:00:00.000Z',
      endedAt: null,
      notes: 'dawn session',
      rodCount: null,
      setup: '',
      createdAt: '2026-07-01T06:00:00.000Z',
    };

    const sanitized = sanitizeRow('sessions', input)!;
    const columns = dataColumns('sessions');
    const dbRow: SqlRow = {};
    dbRow['id'] = sanitized.id;
    dbRow['updated_at_ms'] = sanitized.updatedAtMs;
    dbRow['deleted_at'] = sanitized.deletedAt;

    for (const [i, column] of columns.entries()) {
      dbRow[column] =
        sanitized.values[i] === undefined ? null : sanitized.values[i];
    }

    expect(syncRowFromDb('sessions', dbRow)).toEqual<SyncTableRow<'sessions'>>(
      input,
    );
  });
});

describe('catch_media rows', () => {
  test('sanitizes a media row into its column values', () => {
    const row = sanitizeRow('catch_media', {
      id: 'media-uuid',
      catchId: 'catch-uuid',
      basename: 'a'.repeat(64) + '.jpg',
      kind: 'photo',
      position: 2,
      createdAt: '2026-07-01T06:00:00.000Z',
      updatedAt: 1000,
      deletedAt: null,
    });

    expect(byColumn('catch_media', row)).toEqual<ColumnValues>({
      catch_id: 'catch-uuid',
      basename: 'a'.repeat(64) + '.jpg',
      kind: 'photo',
      position: 2,
      created_at: '2026-07-01T06:00:00.000Z',
    });
  });

  test('falls back to photo for an unknown kind', () => {
    const row = sanitizeRow('catch_media', {
      id: 'media-uuid',
      kind: 'audio',
      updatedAt: 1000,
    });
    expect(byColumn('catch_media', row)['kind']).toBe('photo');
  });

  test('clamps position into the six-item range the app allows', () => {
    const over = sanitizeRow('catch_media', {
      id: 'a',
      position: 99,
      updatedAt: 1,
    });
    const under = sanitizeRow('catch_media', {
      id: 'b',
      position: -4,
      updatedAt: 1,
    });
    const bogus = sanitizeRow('catch_media', {
      id: 'c',
      position: 'first',
      updatedAt: 1,
    });
    expect(
      [over, under, bogus].map(row => byColumn('catch_media', row)['position']),
    ).toEqual([5, 0, 0]);
  });

  test('maps a stored row back to a sync row', () => {
    expect(
      syncRowFromDb('catch_media', {
        id: 'media-uuid',
        catch_id: 'catch-uuid',
        basename: 'a'.repeat(64) + '.jpg',
        kind: 'video',
        position: 1,
        created_at: '2026-07-01T06:00:00.000Z',
        updated_at_ms: 1000,
        deleted_at: null,
      }),
    ).toEqual<SyncTableRow<'catch_media'>>({
      id: 'media-uuid',
      catchId: 'catch-uuid',
      basename: 'a'.repeat(64) + '.jpg',
      kind: 'video',
      position: 1,
      createdAt: '2026-07-01T06:00:00.000Z',
      updatedAt: 1000,
      deletedAt: null,
    });
  });

  test('falls back to photo for an unknown stored kind', () => {
    expect(
      syncRowFromDb('catch_media', {
        id: 'media-uuid',
        catch_id: 'catch-uuid',
        basename: 'a'.repeat(64) + '.jpg',
        kind: 'audio',
        position: 0,
        created_at: '2026-07-01T06:00:00.000Z',
        updated_at_ms: 1000,
        deleted_at: null,
      }).kind,
    ).toBe('photo');
  });
});
