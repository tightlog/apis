import { isSyncKey } from './http';
import { bearerToken } from '@tightlog/worker-utils/services/clerk';

export function extractSyncKey(request: Request): string | null {
  const token = bearerToken(request.headers.get('authorization'));
  return token && isSyncKey(token) ? token : null;
}
