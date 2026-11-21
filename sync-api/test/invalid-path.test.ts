import { describe, expect, test } from 'vitest';
import { handler } from '../src/handler';
import type { Env } from '../src/types';

describe('a malformed percent escape in a path parameter', () => {
  test.each([
    ['PUT', '/v1/sync/media/%E0'],
    ['GET', '/v1/sync/%E0'],
  ])('%s %s is a 400', async (method, path) => {
    // SAFETY: the path is rejected before the handler reads any binding.
    const env = {} as Env;
    // SAFETY: the path is rejected before the handler uses the context.
    const ctx = {} as ExecutionContext;
    const response = await handler.fetch(
      new Request(`https://sync.test${path}`, { method }),
      env,
      ctx,
    );

    expect({ status: response.status, body: await response.json() }).toEqual({
      status: 400,
      body: { error: 'invalid_path' },
    });
  });
});
