import type { EnvCheck } from '@tightlog/worker-utils/types/env-check';
import type { WorkerBaseEnv } from '@tightlog/worker-utils/worker/fetch';

export const envCheck: EnvCheck<Cloudflare.Env, WorkerBaseEnv> = true;
