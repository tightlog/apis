import type { WorkerErrorBody } from '../http/error-code';
import * as Sentry from '@sentry/cloudflare';
import { handleHealth, handleVersion } from '../request/health';
import type { HealthEnv } from '../request/health';
import { json } from '../request/json';
import { logError } from './log';
import type { SentryEnv } from './sentry';

export interface WorkerBaseEnv extends HealthEnv, SentryEnv {}

type FetchHandler<E> = (
  request: Request,
  env: E,
  ctx: ExecutionContext,
) => Response | null | Promise<Response | null>;

interface WorkerFetchOptions {
  name: string;
}

export class ResponseError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status: number) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

export function workerFetch<E extends HealthEnv>(
  dispatch: FetchHandler<E>,
  { name }: WorkerFetchOptions,
): (request: Request, env: E, ctx: ExecutionContext) => Promise<Response> {
  return async (request, env, ctx) => {
    const { pathname } = new URL(request.url);
    if (pathname === '/health') {
      return handleHealth(env);
    }

    if (pathname === '/version') {
      return handleVersion(env);
    }

    try {
      return (
        (await dispatch(request, env, ctx)) ??
        json<WorkerErrorBody>({ error: 'not_found' }, 404)
      );
    } catch (error) {
      if (error instanceof ResponseError) {
        if (error.status >= 500) {
          Sentry.captureException(error);
        }

        return json<WorkerErrorBody<string>>(
          { error: error.code },
          error.status,
        );
      }

      if (error instanceof URIError) {
        return json<WorkerErrorBody>({ error: 'invalid_path' }, 400);
      }

      logError(`unhandled ${name} error`, error);
      Sentry.captureException(error);
      return json<WorkerErrorBody>({ error: 'internal_error' }, 500);
    }
  };
}

interface MonitorOptions {
  checkinMargin: number;
  maxRuntime: number;
}

export function scheduledWithMonitor<E>(
  slug: string,
  run: (
    controller: ScheduledController,
    env: E,
    ctx: ExecutionContext,
  ) => Promise<void>,
  { checkinMargin, maxRuntime }: MonitorOptions,
): (
  controller: ScheduledController,
  env: E,
  ctx: ExecutionContext,
) => Promise<void> {
  return async (controller, env, ctx) => {
    await Sentry.withMonitor(slug, () => run(controller, env, ctx), {
      schedule: { type: 'crontab', value: controller.cron },
      checkinMargin,
      maxRuntime,
    });
  };
}
