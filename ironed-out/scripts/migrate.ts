import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

const ROLE = 'ironed_app';

/**
 * Applies migrations as the schema owner, then makes sure the app role exists with the right
 * privileges. Safe to run on every deploy.
 */
async function main() {
  const url =
    process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) throw new Error('Set MIGRATION_DATABASE_URL (or DATABASE_URL)');
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    const password = process.env.APP_DB_PASSWORD;
    if (password) {
      // Create/update the login role before migrating so the grants in the migrations apply.
      const [exists] = await sql`select 1 from pg_roles where rolname = ${ROLE}`;
      const pw = password.replace(/'/g, "''");
      await sql.unsafe(
        exists
          ? // Only superusers may change SUPERUSER/BYPASSRLS, and they were set at creation.
            `ALTER ROLE ${ROLE} WITH LOGIN PASSWORD '${pw}'`
          : `CREATE ROLE ${ROLE} WITH LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE PASSWORD '${pw}'`,
      );
      const [flags] = await sql`select rolsuper, rolbypassrls from pg_roles where rolname = ${ROLE}`;
      if (flags?.rolsuper || flags?.rolbypassrls) {
        throw new Error(`${ROLE} can bypass Row-Level Security; recreate it without SUPERUSER/BYPASSRLS.`);
      }
      console.log(`App role ${ROLE} ${exists ? 'updated' : 'created'}.`);
    }

    await migrate(drizzle(sql), { migrationsFolder: './drizzle' });

    const [role] = await sql`select 1 from pg_roles where rolname = ${ROLE}`;
    if (role) {
      // Idempotent: covers tables created before the role existed. Mirrors the migrations' revokes.
      // (Drizzle's own journal lives in the "drizzle" schema, which the role can't reach.)
      await sql.unsafe(`
        GRANT USAGE ON SCHEMA public TO ${ROLE};
        GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${ROLE};
        GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${ROLE};
        REVOKE INSERT, UPDATE, DELETE ON tenants, courses FROM ${ROLE};
        REVOKE UPDATE, DELETE ON audit_log, outing_events FROM ${ROLE};
      `);
      console.log(`Privileges for ${ROLE} checked.`);
    }
    console.log('Migrations applied.');
  } finally {
    await sql.end();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
