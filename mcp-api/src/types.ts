export interface Env {
  SENTRY_DSN?: string;
  SENTRY_ENVIRONMENT: string;
  SENTRY_TRACES_SAMPLE_RATE?: string;
  GIT_SHA?: string;
  DEPLOYED_AT?: string;
  DEPLOYED_BY?: string;
  CF_VERSION_METADATA?: { id: string; tag: string; timestamp: string };
}

export interface Coordinates {
  latitude: number;
  longitude: number;
}
