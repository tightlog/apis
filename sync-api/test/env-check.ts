import type { EnvCheck } from '@tightlog/worker-utils/types/env-check';
import type { Env } from '../src/types';

export const envCheck: EnvCheck<Cloudflare.Env, Env> = true;
