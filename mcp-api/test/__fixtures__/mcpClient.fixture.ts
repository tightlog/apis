import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { toolResultValue } from '../../src/http';
import type { ToolTextResult } from '../../src/http';
import type { WorkerBaseEnv } from '@tightlog/worker-utils/worker/fetch';
import { handler } from '../../src/handler';

const env: WorkerBaseEnv = { SENTRY_ENVIRONMENT: 'test' };

const ctx = {} as ExecutionContext;

export async function connectClient(): Promise<Client> {
  const client = new Client({ name: 'test', version: '0.0.0' });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`https://mcp.test/mcp`), {
      fetch: (url, init) => handler.fetch(new Request(url, init), env, ctx),
    }),
  );
  return client;
}

export function toolJson<T>(
  result: Awaited<ReturnType<Client['callTool']>>,
): T {
  // SAFETY: the caller names the tool's own return type.
  return toolResultValue(result as ToolTextResult) as T;
}
