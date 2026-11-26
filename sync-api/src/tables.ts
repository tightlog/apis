import type { Value } from '@libsql/client/web';
import { z } from 'zod';
import { SYNC_TEXT_MAX, SYNC_ROW_FIELDS } from './http';
import type { SyncField, SyncTableName, SyncTableRow } from './http';
import type { SqlRow } from '@tightlog/worker-utils/services/libsql';
import type { SyncRow } from './types';

export const MAX_FUTURE_SKEW_MS = 60_000;

type DbValue = string | number | null;
type SyncValue = string | number | boolean | null;

interface Field {
  column: string;
  toDb: (value: unknown) => DbValue;
  fromDb: (value: Value) => SyncValue;
}

const syncValueSchema = z
  .union([z.string(), z.number(), z.boolean(), z.null()])
  .catch(null);

export const syncRowSchema = z.record(z.string(), syncValueSchema).catch({});

export type SyncRowInput = z.infer<typeof syncRowSchema>;

export interface SanitizedRow {
  id: string;
  updatedAtMs: number;
  deletedAt: string | null;
  values: DbValue[];
  sent: boolean[];
}

function clip(value: string): string {
  return value.slice(0, SYNC_TEXT_MAX);
}

function codec(field: SyncField): Omit<Field, 'column'> {
  switch (field.type) {
    case 'text': {
      return {
        toDb: value => (typeof value === 'string' ? clip(value) : ''),
        fromDb: value => (typeof value === 'string' ? value : ''),
      };
    }
    case 'textOrNull': {
      return {
        toDb: value => (typeof value === 'string' ? clip(value) : null),
        fromDb: value => (typeof value === 'string' ? value : null),
      };
    }
    case 'number': {
      return {
        toDb: value => (typeof value === 'number' ? value : null),
        fromDb: value => (typeof value === 'number' ? value : null),
      };
    }
    case 'boolean': {
      const fallback = field.fallback ? 1 : 0;
      return {
        toDb: value =>
          typeof value === 'boolean' ? (value ? 1 : 0) : fallback,
        fromDb: value => value === 1,
      };
    }
    case 'integer': {
      return {
        toDb: value =>
          typeof value === 'number' && Number.isFinite(value)
            ? Math.min(Math.max(Math.trunc(value), 0), field.max)
            : 0,
        fromDb: value => (typeof value === 'number' ? value : 0),
      };
    }
    case 'oneOf': {
      return {
        toDb: value =>
          typeof value === 'string' && field.values.includes(value)
            ? value
            : field.fallback,
        fromDb: value =>
          typeof value === 'string' && field.values.includes(value)
            ? value
            : field.fallback,
      };
    }
    default: {
      return field satisfies never;
    }
  }
}

const COLUMNS = {
  catches: {
    species: 'species',
    weightKg: 'weight_kg',
    lengthCm: 'length_cm',
    caughtAt: 'caught_at',
    spotId: 'spot_id',
    sessionId: 'session_id',
    method: 'method',
    weather: 'weather',
    airTempC: 'air_temp_c',
    windKph: 'wind_kph',
    pressureHpa: 'pressure_hpa',
    latitude: 'latitude',
    longitude: 'longitude',
    released: 'released',
    landed: 'landed',
    pinned: 'pinned',
    bait: 'bait',
    hookBait: 'hook_bait',
    peg: 'peg',
    swim: 'swim',
    rigId: 'rig_uuid',
    notes: 'notes',
    createdAt: 'created_at',
  },
  spots: {
    name: 'name',
    waterType: 'water_type',
    latitude: 'latitude',
    longitude: 'longitude',
    notes: 'notes',
    createdAt: 'created_at',
  },
  sessions: {
    name: 'name',
    startedAt: 'started_at',
    endedAt: 'ended_at',
    notes: 'notes',
    rodCount: 'rod_count',
    setup: 'setup',
    createdAt: 'created_at',
  },
  catch_media: {
    catchId: 'catch_id',
    basename: 'basename',
    kind: 'kind',
    position: 'position',
    createdAt: 'created_at',
  },
} satisfies {
  [T in SyncTableName]: Record<keyof (typeof SYNC_ROW_FIELDS)[T], string>;
};

function buildFields(
  table: SyncTableName,
): readonly (readonly [string, Field])[] {
  const columns: Record<string, string> = COLUMNS[table];
  const spec: Record<string, SyncField> = SYNC_ROW_FIELDS[table];
  return Object.entries(spec).map(([name, field]) => [
    name,
    { column: columns[name] ?? name, ...codec(field) },
  ]);
}

const TABLE_FIELDS = {
  catches: buildFields('catches'),
  spots: buildFields('spots'),
  sessions: buildFields('sessions'),
  catch_media: buildFields('catch_media'),
} satisfies Record<SyncTableName, readonly (readonly [string, Field])[]>;

function fields(table: SyncTableName): readonly (readonly [string, Field])[] {
  return TABLE_FIELDS[table];
}

export function dataColumns(table: SyncTableName): string[] {
  return fields(table).map(([, field]) => field.column);
}

const MEDIA_BASENAME_INDEX = fields('catch_media').findIndex(
  ([name]) => name === 'basename',
);

export function sanitizeRow(
  table: SyncTableName,
  row: SyncRowInput,
  nowMs?: number,
): SanitizedRow | null {
  const idValue = row['id'];
  const id = typeof idValue === 'string' ? idValue.slice(0, 128) : '';

  const updatedAtValue = row['updatedAt'];
  let updatedAtMs =
    typeof updatedAtValue === 'number' && Number.isFinite(updatedAtValue)
      ? Math.trunc(updatedAtValue)
      : null;

  if (!id || updatedAtMs === null || updatedAtMs <= 0) {
    return null;
  }

  if (nowMs !== undefined && Number.isFinite(nowMs)) {
    const ceiling = Math.trunc(nowMs) + MAX_FUTURE_SKEW_MS;
    if (updatedAtMs > ceiling) {
      updatedAtMs = ceiling;
    }
  }

  const deletedAtValue = row['deletedAt'];
  return {
    id,
    updatedAtMs,
    deletedAt: typeof deletedAtValue === 'string' ? clip(deletedAtValue) : null,
    values: fields(table).map(([name, field]) => field.toDb(row[name])),
    sent: fields(table).map(([name]) => Object.hasOwn(row, name)),
  };
}

export function syncRowFromDb<T extends SyncTableName>(
  table: T,
  dbRow: SqlRow,
): SyncTableRow<T>;
export function syncRowFromDb(table: SyncTableName, dbRow: SqlRow): SyncRow {
  const idValue = dbRow['id'];
  const updatedAtMs = dbRow['updated_at_ms'];
  const deletedAt = dbRow['deleted_at'];
  const syncRow: SyncRow = {
    id: typeof idValue === 'string' ? idValue : '',
    updatedAt: typeof updatedAtMs === 'number' ? updatedAtMs : 0,
    deletedAt: typeof deletedAt === 'string' ? deletedAt : null,
  };

  for (const [name, field] of fields(table)) {
    const columnValue = dbRow[field.column];
    syncRow[name] = field.fromDb(columnValue ?? null);
  }

  return syncRow;
}

export function mediaBasenameOf(row: SanitizedRow): string | null {
  const value = row.values[MEDIA_BASENAME_INDEX];
  return typeof value === 'string' && value ? value : null;
}
