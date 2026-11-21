import * as Sentry from '@sentry/cloudflare';
import { workerSentryOptions } from '@tightlog/worker-utils/worker/sentry';
import type { WorkerBaseEnv } from '@tightlog/worker-utils/worker/fetch';
import { handler } from './handler';

const sentryOptions = workerSentryOptions<WorkerBaseEnv>();

export default Sentry.withSentry(sentryOptions, handler);
