import * as Sentry from '@sentry/cloudflare';
import { MCP_PATH } from '@tightlog/protocol/coach';
import { json, handleHealth } from '@tightlog/worker-utils';
import { handleMcp } from './handlers/mcp/handleMcp';
import type { Env } from './types';

type Route = (request: Request) => Promise<Response>;

const ROUTES = new Map<string, Route>([
  [`GET ${MCP_PATH}`, handleMcp],
  [`POST ${MCP_PATH}`, handleMcp],
  [`DELETE ${MCP_PATH}`, handleMcp],
]);

function dispatch(request: Request, env: Env): Response | Promise<Response> {
  const { pathname } = new URL(request.url);

  if (pathname === '/health') {
    return handleHealth(env);
  }

  const route = ROUTES.get(`${request.method} ${pathname}`);

  if (route) {
    return route(request);
  }

  return json({ error: 'not_found' }, 404);
}

export const handler = {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await dispatch(request, env);
    } catch (error) {
      console.error('unhandled mcp error', error);
      Sentry.captureException(error);
      return json({ error: 'internal_error' }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
