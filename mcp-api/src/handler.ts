import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import type { WorkerBaseEnv } from '@tightlog/worker-utils/worker/fetch';
import { workerFetch } from '@tightlog/worker-utils/worker/fetch';
import { createServer } from './server';

async function handleMcp(request: Request): Promise<Response> {
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await createServer().connect(transport);
  return transport.handleRequest(request);
}

type Route = (request: Request) => Promise<Response>;

const ROUTES = new Map<string, Route>([
  [`GET /mcp`, handleMcp],
  [`POST /mcp`, handleMcp],
  [`DELETE /mcp`, handleMcp],
]);

function dispatch(request: Request): Promise<Response> | null {
  const route = ROUTES.get(
    `${request.method} ${new URL(request.url).pathname}`,
  );

  return route ? route(request) : null;
}

export const handler = {
  fetch: workerFetch<WorkerBaseEnv>(dispatch, { name: 'mcp' }),
} satisfies ExportedHandler<WorkerBaseEnv>;
