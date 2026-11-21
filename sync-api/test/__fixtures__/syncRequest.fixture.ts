import { sha256HexOfText } from '@tightlog/worker-utils/utils/sha256';
import type { Env } from '../../src/types';

export function syncKey(seed: string): string {
  return `logbook-key-${seed.repeat(64).slice(0, 64)}`;
}

export function keyHashOf(key: string): Promise<string> {
  return sha256HexOfText(key);
}

export function testEnv(overrides: Partial<Env> = {}): Env {
  return {
    TURSO_DATABASE_URL: 'libsql://test',
    SENTRY_ENVIRONMENT: 'test',
    APP_ATTEST_ENV: 'development',
    ...overrides,
  };
}

export function syncRequest(
  path: string,
  init: {
    key: string;
    method?: string;
    body?: BodyInit;
    headers?: Record<string, string>;
  },
): Request {
  return new Request(`https://sync.test${path}`, {
    method: init.method ?? 'POST',
    body: init.body ?? null,
    headers: { authorization: `Bearer ${init.key}`, ...init.headers },
  });
}

export function jsonRequest(path: string, key: string, body: unknown): Request {
  const text = JSON.stringify(body);
  return syncRequest(path, {
    key,
    body: text,
    headers: {
      'content-type': 'application/json',
      'content-length': String(new TextEncoder().encode(text).byteLength),
    },
  });
}

export function recordingLimiter(
  blocked: Set<string> = new Set(),
): RateLimit & {
  keys: string[];
} {
  const keys: string[] = [];
  return {
    keys,
    limit: ({ key }) => {
      keys.push(key);
      return Promise.resolve({ success: !blocked.has(key) });
    },
  };
}
