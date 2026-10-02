/**
 * Docker-free local Postgres: PGlite (real Postgres compiled to WASM) behind a wire-protocol
 * socket. Applies migrations and the seed on start, then switches the connection to the
 * non-superuser `ironed_app` role so Row-Level Security behaves like production.
 *
 *   pnpm db:local            # persistent data in ./.pglite
 *   pnpm db:local --fresh    # wipe and start over
 *   pnpm db:local --memory   # throwaway database (used by Playwright)
 *
 * Use with DATABASE_URL=postgres://postgres@127.0.0.1:5433/postgres and DATABASE_POOL_MAX=1
 * (PGlite has a single connection; pooling would interleave transactions).
 */
import { PGlite } from '@electric-sql/pglite';
import { citext } from '@electric-sql/pglite/contrib/citext';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { postgis } from '@electric-sql/pglite-postgis';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { rmSync } from 'node:fs';
import * as schema from '../src/server/db/schema';
import { seed } from '../src/server/db/seed';

const DATA_DIR = './.pglite';
const PORT = Number(process.env.LOCAL_DB_PORT ?? 5433);

async function main() {
  const inMemory = process.argv.includes('--memory');
  if (process.argv.includes('--fresh')) rmSync(DATA_DIR, { recursive: true, force: true });
  const pg = await PGlite.create({
    ...(inMemory ? {} : { dataDir: DATA_DIR }),
    extensions: { citext, pg_trgm, postgis },
  });
  await pg.exec(`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ironed_app') THEN
      CREATE ROLE ironed_app NOLOGIN NOSUPERUSER NOBYPASSRLS;
    END IF; END $$;`);
  const db = drizzle(pg, { schema });
  await migrate(db, { migrationsFolder: './drizzle' });
  await seed(db);
  await pg.exec('SET ROLE ironed_app');

  const server = new PGLiteSocketServer({ db: pg, port: PORT, host: '127.0.0.1' });
  await server.start();
  console.log(
    `Local Postgres (PGlite) on 127.0.0.1:${PORT}${inMemory ? ' (in memory)' : `, data in ${DATA_DIR}`}`,
  );

  const stop = async () => {
    await server.stop();
    await pg.close();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
