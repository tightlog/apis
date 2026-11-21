import { describe, expect, test } from 'vitest';
import { handler } from '../src/handler';
import { testEnv } from './__fixtures__/syncRequest.fixture';

describe('attest routes', () => {
  test.each(['/attest/challenge', '/attest/register'])(
    'POST %s reaches the handshake',
    async path => {
      // SAFETY: the handshake refuses before it uses the context.
      const ctx = {} as ExecutionContext;
      const response = await handler.fetch(
        new Request(`https://sync.test${path}`, { method: 'POST' }),
        testEnv(),
        ctx,
      );

      expect({
        status: response.status,
        body: await response.json(),
      }).toEqual({ status: 503, body: { error: 'attestation_unavailable' } });
    },
  );
});
