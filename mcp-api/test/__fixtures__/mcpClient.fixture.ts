import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { MCP_PATH, toolResultValue } from '@tightlog/protocol/coach';
import type { ToolTextResult } from '@tightlog/protocol/coach';
import { handler } from '../../src/handler';
import type { Env } from '../../src/types';

const env: Env = { SENTRY_ENVIRONMENT: 'test' };

export async function connectClient(): Promise<Client> {
  const client = new Client({ name: 'test', version: '0.0.0' });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`https://mcp.test${MCP_PATH}`), {
      fetch: (url, init) => handler.fetch(new Request(url, init), env),
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
