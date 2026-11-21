import type { Env } from './types';
import { createLibsqlDb } from '@tightlog/worker-utils/services/libsql';
import type { Db } from '@tightlog/worker-utils/services/libsql';

export function getDb(env: Env): Db {
  return createLibsqlDb(env);
}
