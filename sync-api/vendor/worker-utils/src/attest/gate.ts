import { playQuotaSubject, playTokenRequestHash } from './play-subject';
import type { PlayLegacyEnv } from './play-legacy';
import * as Sentry from '@sentry/cloudflare';
import {
  AttestError,
  verifyAssertion,
  verifyAttestation,
} from '@tightlog/app-attest';
import type { AppAttestEnv } from '@tightlog/app-attest';
import {
  ATTEST_ASSERTION_HEADER,
  ATTEST_KEY_ID_HEADER,
  PLAY_INTEGRITY_HEADER,
} from '../http/attest';
import type { AttestErrorCode, AttestRegistration } from '../http/attest';
import { z } from 'zod';
import { commaList } from '../utils/comma-list';
import type { WorkerErrorBody } from '../http/error-code';
import { json } from '../request/json';
import { parseJsonBody } from '../request/parse-body';
import {
  PLAY_INTEGRITY_TOKEN_MAX_LENGTH,
  playIntegritySettings,
  verifyPlayIntegrityToken,
} from './play-integrity';
import type { PlayIntegrityReason } from './play-integrity';
import { clientKey, rateLimited } from '../request/rate-limit';
import { sha256Hex, sha256HexOfText } from '../utils/sha256';

type AttestErrorBody = WorkerErrorBody<AttestErrorCode>;

export const CHALLENGE_TTL_MS = 5 * 60 * 1000;

const ATTEST_REGISTER_BODY_LIMIT = 128 * 1024;

const MAX_KEY_ID_LENGTH = 512;

const MAX_ASSERTION_LENGTH = 8192;

export interface AttestEnv extends PlayLegacyEnv {
  APP_ATTEST_ENV?: string;
  APPLE_TEAM_ID?: string;
  APP_ATTEST_BUNDLE_IDS?: string;
  PLAY_PACKAGE_NAMES?: string;
  PLAY_CERT_SHA256?: string;
  PLAY_INTEGRITY_SERVICE_ACCOUNT?: string;
}

interface AttestSettings {
  env: AppAttestEnv;
  teamId: string | null;
  bundleIds: string[];
  required: boolean;
  configured: boolean;
}

function attestSettings(env: AttestEnv): AttestSettings {
  const appAttestEnv: AppAttestEnv =
    env.APP_ATTEST_ENV === 'development' ? 'development' : 'production';
  const teamId = env.APPLE_TEAM_ID ?? '';
  const bundleIds = commaList(env.APP_ATTEST_BUNDLE_IDS);
  return {
    env: appAttestEnv,
    teamId: teamId === '' ? null : teamId,
    bundleIds,
    required: appAttestEnv === 'production',
    configured: teamId !== '' && bundleIds.length > 0,
  };
}

export interface AttestKey {
  publicKeySpkiB64: string;
  bundleId: string;
  counter: number;
}

export type AdvanceResult =
  | { ok: true }
  | {
      ok: false;
      status: 401 | 429;
      error: 'attestation_unknown_key' | 'attestation_replay' | 'daily_limit';
    };

export interface AttestStore {
  issueChallenge(challenge: string, nowMs: number): Promise<void>;
  consumeChallenge(challenge: string, nowMs: number): Promise<boolean>;
  putKey(
    keyId: string,
    key: Omit<AttestKey, 'counter'>,
    nowMs: number,
  ): Promise<void>;
  getKey(keyId: string): Promise<AttestKey | null>;
  advanceCounter(keyId: string, counter: number): Promise<AdvanceResult>;
  claimPlayToken(tokenHash: string, nowMs: number): Promise<boolean>;
}

export interface AttestPrincipal {
  kind: 'key' | 'play';
  id: string;
}

type GateRejectionReason =
  | Extract<AdvanceResult, { ok: false }>['error']
  | PlayIntegrityReason
  | 'play_integrity_replay'
  | 'play_install_id_required'
  | 'attestation_unavailable'
  | 'attestation_required'
  | 'attestation_malformed'
  | 'attestation_failed';

export type GateResult =
  | { ok: true; principal: AttestPrincipal | null }
  | {
      ok: false;
      status: 400 | 401 | 429 | 503;
      error: GateRejectionReason;
      detail?: string;
    };

export interface GateDeps {
  nowMs?: number;
  verifyPlayIntegrity?: typeof verifyPlayIntegrityToken;
}

const attestRegisterSchema = z.object({
  keyId: z.string().min(1).max(1024),
  attestation: z
    .string()
    .min(1)
    .max(64 * 1024),
  challenge: z.string().min(1).max(1024),
} satisfies Record<keyof AttestRegistration, z.ZodType>);

function randomChallenge(): string {
  return btoa(
    String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))),
  );
}

async function issueChallenge(
  store: AttestStore,
  nowMs: number,
): Promise<string> {
  const challenge = randomChallenge();
  await store.issueChallenge(challenge, nowMs);
  return challenge;
}

async function registerKey(
  env: AttestEnv,
  store: AttestStore,
  registration: AttestRegistration,
  nowMs: number,
): Promise<void> {
  if (!(await store.consumeChallenge(registration.challenge, nowMs))) {
    throw new AttestError('unknown or expired challenge');
  }

  const settings = attestSettings(env);
  if (!settings.teamId) {
    throw new AttestError('APPLE_TEAM_ID is not configured');
  }

  const result = await verifyAttestation(
    registration.keyId,
    registration.attestation,
    registration.challenge,
    settings.teamId,
    settings.bundleIds,
    settings.env,
  );
  await store.putKey(
    registration.keyId,
    { publicKeySpkiB64: result.publicKeySpkiB64, bundleId: result.bundleId },
    nowMs,
  );
}

const unavailable: GateResult = {
  ok: false,
  status: 503,
  error: 'attestation_unavailable',
};

async function gatePlayIntegrity(
  env: AttestEnv,
  store: AttestStore | null,
  token: string,
  headers: Headers,
  requestHash: string,
  deps: GateDeps | undefined,
): Promise<GateResult> {
  if (token.length > PLAY_INTEGRITY_TOKEN_MAX_LENGTH) {
    return { ok: false, status: 401, error: 'attestation_malformed' };
  }

  const subject = playQuotaSubject(env, headers);
  if (!subject) {
    return { ok: false, status: 400, error: 'play_install_id_required' };
  }

  const settings = playIntegritySettings(env);
  if (!settings || !store) {
    return unavailable;
  }

  const nowMs = deps?.nowMs ?? Date.now();
  if (!(await store.claimPlayToken(await sha256HexOfText(token), nowMs))) {
    return { ok: false, status: 401, error: 'play_integrity_replay' };
  }

  const verify = deps?.verifyPlayIntegrity ?? verifyPlayIntegrityToken;
  const verdict = await verify({
    token,
    requestHash: await playTokenRequestHash(headers, requestHash),
    packageNames: settings.packageNames,
    certificateDigests: settings.certificateDigests,
    serviceAccountJson: settings.serviceAccountJson,
    nowMs,
  });
  if (!verdict.ok) {
    return { ok: false, status: verdict.status, error: verdict.error };
  }

  return { ok: true, principal: { kind: 'play', id: subject } };
}

export async function attestGate(
  env: AttestEnv,
  store: AttestStore | null,
  headers: Headers,
  signed: string | BufferSource,
  deps?: GateDeps,
): Promise<GateResult> {
  const keyId = headers.get(ATTEST_KEY_ID_HEADER);
  const assertion = headers.get(ATTEST_ASSERTION_HEADER);
  const playToken = headers.get(PLAY_INTEGRITY_HEADER);
  const settings = attestSettings(env);

  if (!keyId && !assertion && !playToken && !settings.required) {
    return { ok: true, principal: null };
  }

  const requestHash =
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- a challenge string and a raw request body are both signed messages
    typeof signed === 'string'
      ? await sha256HexOfText(signed)
      : await sha256Hex(signed);

  if (playToken && !(keyId && assertion)) {
    return gatePlayIntegrity(env, store, playToken, headers, requestHash, deps);
  }

  const teamId = settings.teamId;
  if (!settings.configured || !store || !teamId) {
    return unavailable;
  }

  if (!keyId || !assertion) {
    return { ok: false, status: 401, error: 'attestation_required' };
  }

  if (
    keyId.length > MAX_KEY_ID_LENGTH ||
    assertion.length > MAX_ASSERTION_LENGTH
  ) {
    return { ok: false, status: 401, error: 'attestation_malformed' };
  }

  const key = await store.getKey(keyId);
  if (!key) {
    return { ok: false, status: 401, error: 'attestation_unknown_key' };
  }

  let newCounter: number;
  try {
    ({ newCounter } = await verifyAssertion(
      assertion,
      requestHash,
      key.publicKeySpkiB64,
      key.counter,
      teamId,
      key.bundleId,
    ));
  } catch (e) {
    return {
      ok: false,
      status: 401,
      error: 'attestation_failed',
      detail: e instanceof Error ? e.message : String(e),
    };
  }

  const advanced = await store.advanceCounter(keyId, newCounter);
  return advanced.ok
    ? { ok: true, principal: { kind: 'key', id: keyId } }
    : advanced;
}

export function attestRejection(
  gate: Exclude<GateResult, { ok: true }>,
  route: string,
): Response {
  Sentry.captureMessage(`attest-gate rejected: ${gate.error}`, {
    level: gate.status === 503 ? 'error' : 'warning',
    tags: { route, reason: gate.error },
    fingerprint: ['attest-gate', gate.error],
    extra: gate.detail === undefined ? {} : { detail: gate.detail },
  });
  const error: AttestErrorCode =
    gate.status === 503
      ? 'attestation_unavailable'
      : gate.status === 429
        ? 'daily_limit'
        : 'attestation';
  return json<AttestErrorBody>({ error }, gate.status);
}

interface AttestHandshakeEnv extends AttestEnv {
  ATTEST_RATE_LIMITER?: RateLimit;
}

interface AttestRegisterOptions {
  registrationAllowed?: (clientKey: string) => Promise<boolean>;
}

export async function handleAttestChallenge(
  request: Request,
  env: AttestHandshakeEnv,
  store: AttestStore | null,
): Promise<Response> {
  const limited = await rateLimited(
    env.ATTEST_RATE_LIMITER,
    clientKey(request),
  );
  if (limited) {
    return limited;
  }

  if (!attestSettings(env).configured || !store) {
    return json<AttestErrorBody>({ error: 'attestation_unavailable' }, 503);
  }

  return json({ challenge: await issueChallenge(store, Date.now()) });
}

export async function handleAttestRegister(
  request: Request,
  env: AttestHandshakeEnv,
  store: AttestStore | null,
  { registrationAllowed }: AttestRegisterOptions = {},
): Promise<Response> {
  const key = clientKey(request);
  const limited = await rateLimited(env.ATTEST_RATE_LIMITER, key);
  if (limited) {
    return limited;
  }

  if (registrationAllowed && !(await registrationAllowed(key))) {
    return json<AttestErrorBody>({ error: 'daily_limit' }, 429);
  }

  if (!attestSettings(env).configured || !store) {
    return json<AttestErrorBody>({ error: 'attestation_unavailable' }, 503);
  }

  const body = await parseJsonBody(
    request,
    ATTEST_REGISTER_BODY_LIMIT,
    attestRegisterSchema,
    { error: 'invalid_registration' },
  );
  if (body instanceof Response) {
    return body;
  }

  try {
    await registerKey(env, store, body, Date.now());
    return json({ ok: true });
  } catch (e) {
    if (e instanceof AttestError) {
      Sentry.captureMessage('attest-register rejected', {
        level: 'warning',
        extra: { detail: e.message },
      });
      return json<AttestErrorBody>({ error: 'attestation' }, 401);
    }

    throw e;
  }
}
