import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { appDatabaseUrl, getEnv } from '../env';
import * as schema from './schema';
import type { Db } from './types';

const globalForDb = globalThis as unknown as { __ioDb?: Db };

/**
 * Shared app database handle. Connects as the non-superuser app role, so RLS applies.
 * `prepare: false` keeps it compatible with transaction-mode poolers (Neon, PgBouncer).
 */
export function getDb(): Db {
  if (!globalForDb.__ioDb) {
    const env = getEnv();
    const client = postgres(appDatabaseUrl(env), {
      max: env.DATABASE_POOL_MAX,
      prepare: false,
      idle_timeout: 20,
    });
    globalForDb.__ioDb = drizzle(client, { schema });
  }
  return globalForDb.__ioDb;
}
