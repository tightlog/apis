import type {
  Deployment,
  HealthResponse,
  VersionResponse,
} from '../http/health';
import { json } from './json';

export interface HealthEnv {
  DEPLOYED_AT?: string;
  DEPLOYED_BY?: string;
  GIT_SHA?: string;
  SERVICE_VERSION?: string;
  CF_VERSION_METADATA?: { timestamp: string };
}

function deployment(env: HealthEnv): Deployment {
  return {
    deployedAt:
      env.DEPLOYED_AT ?? env.CF_VERSION_METADATA?.timestamp ?? 'unknown',
    deployedBy: env.DEPLOYED_BY ?? 'unknown',
    gitSha: env.GIT_SHA ?? 'unknown',
  };
}

export function handleHealth(env: HealthEnv): Response {
  return json<HealthResponse>({ ok: true, ...deployment(env) });
}

export function handleVersion(env: HealthEnv): Response {
  return json<VersionResponse>({
    version: env.SERVICE_VERSION ?? 'unknown',
    ...deployment(env),
  });
}
