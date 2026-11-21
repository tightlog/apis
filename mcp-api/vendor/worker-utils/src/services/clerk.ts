import type { WorkerErrorBody } from '../http/error-code';
import { verifyToken } from '@clerk/backend';
import {
  TokenVerificationError,
  TokenVerificationErrorReason,
} from '@clerk/backend/errors';
import * as Sentry from '@sentry/cloudflare';
import { json } from '../request/json';

export interface ClerkEnv {
  CLERK_SECRET_KEY?: string;
  CLERK_JWT_KEY?: string;
}

export type ClerkVerdict =
  | { ok: true; userId: string }
  | {
      ok: false;
      reason: 'not_configured' | 'missing' | 'invalid' | 'unavailable';
    };

const OUTAGE_REASONS: ReadonlySet<string> = new Set([
  TokenVerificationErrorReason.RemoteJWKFailedToLoad,
  TokenVerificationErrorReason.JWKFailedToResolve,
  TokenVerificationErrorReason.LocalJWKMissing,
  TokenVerificationErrorReason.InvalidSecretKey,
]);

type ClerkRejectionReason = Extract<ClerkVerdict, { ok: false }>['reason'];

const REJECTIONS = {
  not_configured: { error: 'not_configured', status: 501 },
  unavailable: { error: 'auth_unavailable', status: 503 },
  missing: { error: 'unauthorized', status: 401 },
  invalid: { error: 'unauthorized', status: 401 },
} as const satisfies Record<
  ClerkRejectionReason,
  { error: WorkerErrorBody['error']; status: number }
>;

export function clerkRejection(
  verdict: Extract<ClerkVerdict, { ok: false }>,
): Response {
  const { error, status } = REJECTIONS[verdict.reason];
  return json<WorkerErrorBody>({ error }, status);
}

export function bearerToken(header: string | null): string | null {
  if (!header || !header.toLowerCase().startsWith('bearer ')) {
    return null;
  }

  const token = header.slice('bearer '.length).trim();
  return token || null;
}

export async function verifyClerkToken(
  token: string | null,
  env: ClerkEnv,
): Promise<ClerkVerdict> {
  if (!env.CLERK_SECRET_KEY) {
    return { ok: false, reason: 'not_configured' };
  }

  if (!token) {
    return { ok: false, reason: 'missing' };
  }

  try {
    const payload = await verifyToken(token, {
      secretKey: env.CLERK_SECRET_KEY,
      jwtKey: env.CLERK_JWT_KEY,
    });
    return payload.sub
      ? { ok: true, userId: payload.sub }
      : { ok: false, reason: 'invalid' };
  } catch (error) {
    if (
      error instanceof TokenVerificationError &&
      !OUTAGE_REASONS.has(error.reason)
    ) {
      return { ok: false, reason: 'invalid' };
    }

    Sentry.captureException(error, { tags: { auth: 'clerk_unavailable' } });
    return { ok: false, reason: 'unavailable' };
  }
}

export function verifyClerkRequest(
  request: Request,
  env: ClerkEnv,
): Promise<ClerkVerdict> {
  return verifyClerkToken(
    bearerToken(request.headers.get('authorization')),
    env,
  );
}
