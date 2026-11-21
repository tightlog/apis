export interface Deployment {
  deployedAt: string;
  deployedBy: string;
  gitSha: string;
}

export interface HealthResponse extends Deployment {
  ok: true;
}

export interface VersionResponse extends Deployment {
  version: string;
}
