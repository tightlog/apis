import * as Sentry from '@sentry/cloudflare';
import { getDb } from './db';
import {
  handleAttestChallenge,
  handleAttestRegister,
} from '@tightlog/worker-utils/attest/gate';
import { tursoAttestStore } from '@tightlog/worker-utils/attest/turso';
import { handleAdoptPurchase } from './handlers/adopt/handleAdoptPurchase';
import { handleEscrowKey } from './handlers/escrow/handleEscrowKey';
import { handleEscrowKeyDelete } from './handlers/escrow/handleEscrowKeyDelete';
import { json } from '@tightlog/worker-utils/request/json';
import { workerFetch } from '@tightlog/worker-utils/worker/fetch';
import { pathPattern } from '@tightlog/worker-utils/request/path';
import { handleIdentityProbe } from './handlers/identity/handleIdentityProbe';
import { handleMediaGet } from './handlers/media/handleMediaGet';
import { handleMediaPut } from './handlers/media/handleMediaPut';
import { handleMediaStatus } from './handlers/media/handleMediaStatus';
import { handlePull } from './handlers/pull/handlePull';
import { handlePush } from './handlers/push/handlePush';
import { handleRecoveryNoticesAck } from './handlers/recovery/handleRecoveryNoticesAck';
import { handleRecoveryNoticesPull } from './handlers/recovery/handleRecoveryNoticesPull';
import { handleRegister } from './handlers/register/handleRegister';
import { SyncRepo } from './repo';
import { sweepUnreferencedMedia } from './scheduled/sweepUnreferencedMedia';
import { MEDIA_SWEEP_CRON } from './cron';
import type { Env } from './types';
import type { SyncErrorBody } from './http';

const MEDIA_PATH = pathPattern('/v1/sync/media/:basename');
const TABLE_PATH = pathPattern('/v1/sync/:table');

type Route = (request: Request, env: Env) => Response | Promise<Response>;

const ROUTES = new Map<string, Route>([
  [`POST /v1/sync/register`, handleRegister],
  [`POST /v1/sync/adopt-purchase`, handleAdoptPurchase],
  [`GET /v1/sync/identity`, handleIdentityProbe],
  [`POST /v1/sync/escrow-key`, handleEscrowKey],
  [`DELETE /v1/sync/escrow-key`, handleEscrowKeyDelete],
  [`GET /v1/sync/recovery-notices`, handleRecoveryNoticesPull],
  [`POST /v1/sync/recovery-notices/ack`, handleRecoveryNoticesAck],
  [`POST /v1/sync/media/status`, handleMediaStatus],
]);

async function dispatch(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const url = new URL(request.url);
  const { pathname } = url;
  const { method } = request;

  if (pathname === '/attest/challenge' && method === 'POST') {
    return handleAttestChallenge(request, env, tursoAttestStore(getDb(env)));
  }

  if (pathname === '/attest/register' && method === 'POST') {
    return handleAttestRegister(request, env, tursoAttestStore(getDb(env)));
  }

  const route = ROUTES.get(`${method} ${pathname}`);

  if (route) {
    return route(request, env);
  }

  const mediaBasename = MEDIA_PATH.exec(pathname)?.[1];
  if (mediaBasename) {
    const basename = decodeURIComponent(mediaBasename);

    if (method === 'PUT') {
      return handleMediaPut(request, env, basename);
    }

    if (method === 'GET') {
      return handleMediaGet(request, env, basename);
    }
  }

  const tableName = TABLE_PATH.exec(pathname)?.[1];
  if (tableName) {
    const table = decodeURIComponent(tableName);

    if (method === 'GET') {
      return handlePull(request, env, table, url);
    }

    if (method === 'POST') {
      return handlePush(request, env, table, ctx);
    }
  }

  return json<SyncErrorBody>({ error: 'not_found' }, 404);
}

export const handler = {
  fetch: workerFetch(dispatch, { name: 'sync' }),

  async scheduled(controller: ScheduledController, env: Env): Promise<void> {
    await Sentry.withMonitor(
      'sync-media-sweep',
      () =>
        sweepUnreferencedMedia(
          new SyncRepo(getDb(env)),
          env.MEDIA,
          controller.scheduledTime,
        ),
      {
        schedule: { type: 'crontab', value: MEDIA_SWEEP_CRON },
        checkinMargin: 10,
        maxRuntime: 15,
      },
    );
  },
} satisfies ExportedHandler<Env>;
