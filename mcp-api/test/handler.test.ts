import { describe, expect, test } from 'vitest';
import { handler } from '../src/handler';
import type { Env } from '../src/types';

const env: Env = { SENTRY_ENVIRONMENT: 'test' };

describe('handler', () => {
  test('serves /health without auth', async () => {
    const response = await handler.fetch(
      new Request('https://mcp.test/health'),
      env,
    );

    expect(await response.json()).toEqual({
      ok: true,
      deployedAt: 'unknown',
      deployedBy: 'unknown',
      gitSha: 'unknown',
    });
  });

  test('404s unknown paths and methods', async () => {
    const unknown = await handler.fetch(
      new Request('https://mcp.test/nope'),
      env,
    );
    const put = await handler.fetch(
      new Request('https://mcp.test/mcp', { method: 'PUT' }),
      env,
    );

    expect([unknown.status, put.status]).toEqual([404, 404]);
  });
});
