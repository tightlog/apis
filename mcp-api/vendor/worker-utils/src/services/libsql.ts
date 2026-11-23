import { createClient } from '@libsql/client/web';
import type { Client, InValue, ResultSet, Value } from '@libsql/client/web';
import { RETRY, retry } from '../worker/retry';
import { z } from 'zod';

export type SqlRow = Record<string, Value>;

export interface RunResult {
  meta: { changes: number };
}

export interface Statement {
  readonly sql: string;
  readonly args: InValue[];
  bind(...args: InValue[]): Statement;
  first<T = SqlRow>(): Promise<T | null>;
  run(): Promise<RunResult>;
  all<T = SqlRow>(): Promise<{ results: T[] }>;
}

export interface Db {
  prepare(sql: string): Statement;
  batch<T = SqlRow>(
    statements: Statement[],
  ): Promise<{ results: T[]; meta: { changes: number } }[]>;
}

export interface LibsqlEnv {
  TURSO_DATABASE_URL?: string;
  TURSO_AUTH_TOKEN?: string;
}

function plainRows({ columns, rows }: ResultSet): SqlRow[] {
  return rows.map(row => {
    const plain: SqlRow = {};
    for (let i = 0; i < columns.length; i++) {
      const column = columns[i];
      if (column === undefined) {
        continue;
      }

      plain[column] = row[i] ?? null;
    }

    return plain;
  });
}

/**
 * Turso is behind Cloudflare. On a 522 the edge did not connect, so no
 * statement ran. The other statuses can arrive after a write committed.
 */
const NOT_DELIVERED_STATUSES = new Set([522]);
const READ_RETRY_STATUSES = new Set([502, 503, 504, 520, 522, 524]);
const ATTEMPTS = 3;
const BASE_DELAY_MS = 200;

const edgeFailure = z.object({
  cause: z.object({ status: z.number() }),
});

function isRead(sql: string): boolean {
  return /^\s*SELECT\b/i.test(sql);
}

async function withTransientRetry<T>(
  read: boolean,
  run: () => Promise<T>,
): Promise<T> {
  const retryable = read ? READ_RETRY_STATUSES : NOT_DELIVERED_STATUSES;
  let lastError: unknown;
  const result = await retry(
    ATTEMPTS,
    async () => {
      try {
        return { value: await run() };
      } catch (error) {
        const failure = edgeFailure.safeParse(error);
        if (!failure.success || !retryable.has(failure.data.cause.status)) {
          throw error;
        }

        lastError = error;
        return RETRY;
      }
    },
    BASE_DELAY_MS,
  );
  if (result === RETRY) {
    throw lastError;
  }

  return result.value;
}

class LibsqlStatement implements Statement {
  private readonly client: Client;
  readonly sql: string;
  readonly args: InValue[];

  constructor(client: Client, sql: string, args: InValue[] = []) {
    this.client = client;
    this.sql = sql;
    this.args = args;
  }

  bind(...args: InValue[]): LibsqlStatement {
    return new LibsqlStatement(this.client, this.sql, args);
  }

  private execute(): Promise<ResultSet> {
    return withTransientRetry(isRead(this.sql), () =>
      this.client.execute({ sql: this.sql, args: this.args }),
    );
  }

  async first<T = SqlRow>(): Promise<T | null> {
    const [row] = plainRows(await this.execute());
    // SAFETY: the caller names the column shape of the statement it prepared.
    return (row as T | undefined) ?? null;
  }

  async run(): Promise<RunResult> {
    return { meta: { changes: (await this.execute()).rowsAffected } };
  }

  async all<T = SqlRow>(): Promise<{ results: T[] }> {
    // SAFETY: the caller names the column shape of the statement it prepared.
    return { results: plainRows(await this.execute()) as T[] };
  }
}

class LibsqlDb implements Db {
  private readonly client: Client;

  constructor(client: Client) {
    this.client = client;
  }

  prepare(sql: string): Statement {
    return new LibsqlStatement(this.client, sql);
  }

  async batch<T = SqlRow>(
    statements: Statement[],
  ): Promise<{ results: T[]; meta: { changes: number } }[]> {
    const results = await withTransientRetry(false, () =>
      this.client.batch(
        statements.map(({ sql, args }) => ({ sql, args })),
        'write',
      ),
    );
    return results.map(res => ({
      // SAFETY: the caller names the column shape of the statements it prepared.
      results: plainRows(res) as T[],
      meta: { changes: res.rowsAffected },
    }));
  }
}

export function libsqlDb(client: Client): Db {
  return new LibsqlDb(client);
}

/**
 * Build one client per request. A client shared at module level queues
 * queries behind its concurrency limit, and Workers cannot resolve one
 * request's I/O from another request's context. The runtime then cancels
 * the waiting request as hung and Cloudflare returns a 500.
 */
export function createLibsqlDb(env: LibsqlEnv): Db {
  const url = env.TURSO_DATABASE_URL?.replace(/^libsql:\/\//, 'https://');
  if (!url) {
    throw new Error('TURSO_DATABASE_URL is not set');
  }

  return libsqlDb(createClient({ url, authToken: env.TURSO_AUTH_TOKEN }));
}
