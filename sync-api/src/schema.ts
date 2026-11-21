import { SCHEMA_VERSION_HEADER } from './http';
import { json } from '@tightlog/worker-utils/request/json';
import type { SyncErrorBody } from './http';

const MIN_SUPPORTED_SCHEMA_VERSION = 1;

export function schemaVersionError(request: Request): Response | null {
  const raw = request.headers.get(SCHEMA_VERSION_HEADER);
  if (raw === null) {
    return null;
  }

  const version = Number(raw);
  if (!Number.isInteger(version) || version < MIN_SUPPORTED_SCHEMA_VERSION) {
    return json<SyncErrorBody>({ error: 'schema_outdated' }, 426);
  }

  return null;
}
