import { PGlite } from '@electric-sql/pglite';
import { citext } from '@electric-sql/pglite/contrib/citext';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { postgis } from '@electric-sql/pglite-postgis';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import * as schema from '@/server/db/schema';
import { seed } from '@/server/db/seed';
import type { Db } from '@/server/db/types';

export type TestDb = {
  pg: PGlite;
  /** Runs as the non-superuser app role, so Row-Level Security applies (like production). */
  db: Db;
  tenantId: string;
  /** Runs `fn` as the schema owner (superuser), e.g. to set up fixtures across tenants. */
  asOwner: <T>(fn: () => Promise<T>) => Promise<T>;
};

/** In-memory Postgres (PGlite) with every migration applied and the base seed loaded. */
export async function createTestDb(): Promise<TestDb> {
  const pg = await PGlite.create({ extensions: { citext, pg_trgm, postgis } });
  await pg.exec(`CREATE ROLE ironed_app NOLOGIN NOSUPERUSER NOBYPASSRLS;`);
  const db = drizzle(pg, { schema });
  await migrate(db, { migrationsFolder: './drizzle' });
  const { tenantId } = await seed(db);
  await pg.exec('SET ROLE ironed_app');

  // PGlite has one connection, so switching role affects everything until it's switched back.
  const asOwner = async <T>(fn: () => Promise<T>): Promise<T> => {
    await pg.exec('RESET ROLE');
    try {
      return await fn();
    } finally {
      await pg.exec('SET ROLE ironed_app');
    }
  };
  return { pg, db, tenantId, asOwner };
}
