import * as Sentry from '@sentry/cloudflare';
import type {
  Breadcrumb,
  CloudflareOptions,
  ErrorEvent,
} from '@sentry/cloudflare';
import { ATTEST_HEADERS } from '../http/attest';
import { z } from 'zod';

const urlText = z.string();

export interface SentryEnv {
  SENTRY_DSN?: string;
  SENTRY_ENVIRONMENT?: string;
}

interface WorkerSentryPolicy {
  rpcTracePropagation?: boolean;
}

const DENIED_REQUEST_HEADERS = [
  'authorization',
  'cookie',
  'cf-access-jwt-assertion',
  ...ATTEST_HEADERS,
  'x-api-secret',
  'x-rc-app-user-id',
  'x-push-secret',
];

const SECRET_PATH_HOSTS = new Set([
  'api.telegram.org',
  'discord.com',
  'discordapp.com',
]);

function withoutQuery(url: string): string {
  const cut = url.search(/[?#]/);
  return cut === -1 ? url : url.slice(0, cut);
}

function redactSecretPath(url: string): string {
  try {
    const parsed = new URL(url);
    return SECRET_PATH_HOSTS.has(parsed.hostname) ? parsed.origin : url;
  } catch {
    return url;
  }
}

function redactBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb {
  const url = urlText.safeParse(breadcrumb.data?.['url']);
  if (!url.success) {
    return breadcrumb;
  }

  return {
    ...breadcrumb,
    data: { ...breadcrumb.data, url: redactSecretPath(url.data) },
  };
}

function scrubEvent(
  event: ErrorEvent,
  denied: ReadonlySet<string>,
): ErrorEvent {
  const request = event.request;
  if (request) {
    if (request.headers) {
      request.headers = Object.fromEntries(
        Object.entries(request.headers).filter(
          ([name]) => !denied.has(name.toLowerCase()),
        ),
      );
    }

    const url = urlText.safeParse(request.url);
    if (url.success) {
      request.url = withoutQuery(url.data);
    }

    delete request.query_string;
  }

  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map(redactBreadcrumb);
  }

  return event;
}

export function workerSentryOptions<E extends SentryEnv>(
  policy: WorkerSentryPolicy = {},
): (env: E) => CloudflareOptions {
  const denied = new Set(
    DENIED_REQUEST_HEADERS.map(name => name.toLowerCase()),
  );

  return env => {
    const dsn = env.SENTRY_DSN?.trim();
    const options: CloudflareOptions = {
      dsn: dsn === '' ? undefined : dsn,
      environment: env.SENTRY_ENVIRONMENT,
      enableLogs: true,
      dataCollection: {
        userInfo: false,
        httpBodies: [],
        httpHeaders: {
          request: { deny: DENIED_REQUEST_HEADERS },
          response: { deny: ['set-cookie'] },
        },
        urlQueryParams: false,
        genAI: { inputs: false, outputs: false },
        databaseQueryData: false,
      },
      beforeSend: event => scrubEvent(event, denied),
      beforeBreadcrumb: redactBreadcrumb,
      integrations: [
        Sentry.consoleLoggingIntegration({ levels: ['log', 'warn', 'error'] }),
      ],
    };
    if (policy.rpcTracePropagation) {
      options.enableRpcTracePropagation = true;
    }

    return options;
  };
}
