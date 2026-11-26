import type { AttestErrorCode } from '@tightlog/worker-utils/http/attest';
import type { RequestErrorCode } from '@tightlog/worker-utils/http/error-code';
import { bytesToHex } from '@tightlog/worker-utils/http/hex';
import {
  isMediaExtension,
  mediaContentType,
} from '@tightlog/worker-utils/http/media';
import type { MediaExtension } from '@tightlog/worker-utils/http/media';

export const SYNC_KEY_PREFIX = 'logbook-key-';

export const SYNC_KEY_BYTES = 32;

const SYNC_KEY_HEX = new RegExp(`^[0-9a-f]{${SYNC_KEY_BYTES * 2}}$`);

export function syncKeyFromBytes(bytes: Uint8Array): string {
  return `${SYNC_KEY_PREFIX}${bytesToHex(bytes)}`;
}

export function isSyncKey(token: string): boolean {
  return (
    token.startsWith(SYNC_KEY_PREFIX) &&
    SYNC_KEY_HEX.test(token.slice(SYNC_KEY_PREFIX.length))
  );
}

const SYNC_IDENTITY_ID_PATTERN = /^[0-9a-f]{64}$/;

export function isSyncIdentityId(value: string): boolean {
  return SYNC_IDENTITY_ID_PATTERN.test(value);
}

export const SCHEMA_VERSION_HEADER = 'x-tightlog-schema-version';

export const SYNC_SCHEMA_VERSION = 1;

export const SYNC_SINCE_PARAM = 'since';

export const SYNC_PUSH_MAX_ROWS = 500;

export const SYNC_PUSH_MAX_BYTES = 1024 * 1024;

export const SYNC_TEXT_MAX = 10_000;

export const SYNC_MEDIA_STATUS_MAX_NAMES = 500;

export const SYNC_MEDIA_MAX_BYTES = 100 * 1024 * 1024;

export const MAX_CATCH_MEDIA = 6;

export const SYNC_MEDIA_QUOTA_BYTES = 2 * 1024 * 1024 * 1024;

export const SYNC_MEDIA_QUOTA_OBJECTS = 2_000;

export type MediaQuotaCode = 'media_quota_bytes' | 'media_quota_objects';

export interface MediaUsage {
  bytes: number;
  objects: number;
}

export function mediaQuotaExceeded(
  usage: MediaUsage,
  addedBytes: number,
): MediaQuotaCode | null {
  if (usage.objects >= SYNC_MEDIA_QUOTA_OBJECTS) {
    return 'media_quota_objects';
  }

  if (usage.bytes + addedBytes > SYNC_MEDIA_QUOTA_BYTES) {
    return 'media_quota_bytes';
  }

  return null;
}

export function isMediaQuotaCode(value: string): value is MediaQuotaCode {
  return value === 'media_quota_bytes' || value === 'media_quota_objects';
}

export function adoptPurchaseChallenge(
  appUserId: string,
  keyHash: string,
): string {
  return `POST\n/v1/sync/adopt-purchase\n${appUserId}\n${keyHash}`;
}

export interface RegisterBody {
  deviceId: string;
  platform?: string;
  model?: string;
  osName?: string;
  osVersion?: string;
  appVersion?: string;
  anglerName?: string;
  clerkToken?: string;
  revenueCatAppUserId?: string;
}

export interface RegisterResponse {
  userId: string;
  hasKeyEscrow: boolean;
}

export interface AdoptPurchaseResponse {
  userId: string;
}

export interface MediaPutResponse {
  basename: string;
  bytes: number;
}

export interface SyncOkResponse {
  ok: true;
}

export interface AdoptPurchaseBody {
  appUserId: string;
  storeTransactionId: string;
}

export interface IdentitySummary {
  known: boolean;
  catches: number;
}

export interface PullResponse<Row> {
  items: Row[];
  nextSince?: number | null;
}

export interface PushBody<Row> {
  items: Row[];
}

export interface MediaStatusBody {
  names: string[];
}

export interface MediaStatusResponse {
  missing: string[];
  usage?: MediaUsage;
}

export const RECOVERY_NOTICE_KINDS = ['account_relinked'] as const;

export type RecoveryNoticeKind = (typeof RECOVERY_NOTICE_KINDS)[number];

const RECOVERY_NOTICE_KIND_SET: ReadonlySet<string> = new Set(
  RECOVERY_NOTICE_KINDS,
);

export function isRecoveryNoticeKind(
  value: string,
): value is RecoveryNoticeKind {
  return RECOVERY_NOTICE_KIND_SET.has(value);
}

export interface RecoveryNotice {
  id: string;
  kind: RecoveryNoticeKind;
  createdAt: string;
}

export interface RecoveryNoticesResponse {
  items: RecoveryNotice[];
}

export interface RecoveryNoticesAckBody {
  ids: string[];
}

export type SyncErrorCode =
  | AttestErrorCode
  | RequestErrorCode
  | MediaQuotaCode
  | 'app_user_id_required'
  | 'body_required'
  | 'checksum_mismatch'
  | 'clerk_linked_elsewhere'
  | 'existing_data'
  | 'invalid_app_user_id'
  | 'invalid_basename'
  | 'items_required'
  | 'media_quota_daily'
  | 'media_unavailable'
  | 'names_required'
  | 'no_active_entitlement'
  | 'no_linked_identity'
  | 'purchase_not_owned'
  | 'revenuecat_unreachable'
  | 'schema_outdated'
  | 'sync_boundary_overflow'
  | 'too_many_names'
  | 'too_many_rows'
  | 'transaction_required'
  | 'unknown_customer'
  | 'unknown_table'
  | 'upload_failed';

export interface SyncErrorBody {
  error: SyncErrorCode;
}

export type SyncField =
  | { type: 'text' }
  | { type: 'textOrNull' }
  | { type: 'number' }
  | { type: 'boolean'; fallback: boolean }
  | { type: 'integer'; max: number }
  | { type: 'oneOf'; values: readonly string[]; fallback: string };

const text = { type: 'text' } as const;
const textOrNull = { type: 'textOrNull' } as const;
const number = { type: 'number' } as const;
const flag = { type: 'boolean', fallback: false } as const;

export const SYNC_ROW_FIELDS = {
  spots: {
    name: text,
    waterType: text,
    latitude: number,
    longitude: number,
    notes: text,
    createdAt: text,
  },
  sessions: {
    name: textOrNull,
    startedAt: text,
    endedAt: textOrNull,
    notes: text,
    rodCount: number,
    setup: text,
    createdAt: text,
  },
  catches: {
    species: text,
    weightKg: number,
    lengthCm: number,
    caughtAt: text,
    spotId: textOrNull,
    sessionId: textOrNull,
    method: text,
    weather: text,
    airTempC: number,
    windKph: number,
    pressureHpa: number,
    latitude: number,
    longitude: number,
    released: flag,
    landed: { type: 'boolean', fallback: true },
    pinned: flag,
    bait: text,
    hookBait: text,
    peg: text,
    swim: text,
    rigId: textOrNull,
    notes: text,
    createdAt: text,
  },
  catch_media: {
    catchId: text,
    basename: text,
    kind: { type: 'oneOf', values: ['photo', 'video'], fallback: 'photo' },
    position: { type: 'integer', max: MAX_CATCH_MEDIA - 1 },
    createdAt: text,
  },
} as const satisfies Record<string, Record<string, SyncField>>;

export type SyncTableName = keyof typeof SYNC_ROW_FIELDS;

const TABLE_NAMES: ReadonlySet<string> = new Set(Object.keys(SYNC_ROW_FIELDS));

export function isSyncTableName(value: string): value is SyncTableName {
  return TABLE_NAMES.has(value);
}

interface SyncFieldValue {
  text: string;
  textOrNull: string | null;
  number: number | null;
  boolean: boolean;
  integer: number;
}

type SyncFieldValueOf<F> = F extends {
  type: 'oneOf';
  values: readonly (infer V)[];
}
  ? V
  : F extends { type: infer K extends keyof SyncFieldValue }
    ? SyncFieldValue[K]
    : never;

type SyncRowFields<T extends SyncTableName> = {
  -readonly [K in keyof (typeof SYNC_ROW_FIELDS)[T]]: SyncFieldValueOf<
    (typeof SYNC_ROW_FIELDS)[T][K]
  >;
};

interface SyncRowMeta {
  id: string;
  updatedAt: number;
  deletedAt: string | null;
}

export type SyncTableRow<T extends SyncTableName> = SyncRowMeta &
  SyncRowFields<T>;

const CONTENT_ADDRESS_PATTERN = /^([a-f0-9]{64})\.([a-z0-9]{2,4})$/;

export function contentAddressedBasename(
  sha256Hex: string,
  ext: MediaExtension,
): string {
  return `${sha256Hex}.${ext}`;
}

export interface ContentAddressedBasename {
  sha256: string;
  contentType: string;
}

export function parseContentAddressedBasename(
  basename: string,
): ContentAddressedBasename | null {
  const match = CONTENT_ADDRESS_PATTERN.exec(basename);
  const sha256 = match?.[1];
  const ext = match?.[2];
  if (sha256 === undefined || ext === undefined || !isMediaExtension(ext)) {
    return null;
  }

  return { sha256, contentType: mediaContentType(basename) };
}
