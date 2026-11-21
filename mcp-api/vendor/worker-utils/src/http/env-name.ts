export const ENV_NAMES = ['staging', 'production'] as const;

export type EnvName = (typeof ENV_NAMES)[number];

export function isEnvName(value: string): value is EnvName {
  return ENV_NAMES.some(name => name === value);
}

export function envNameOrStaging(value: string | undefined): EnvName {
  return value !== undefined && isEnvName(value) ? value : 'staging';
}
