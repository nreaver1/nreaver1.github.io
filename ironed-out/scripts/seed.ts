import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../src/server/db/schema';
import { seed, seedWidgetDemo } from '../src/server/db/seed';

async function main() {
  const url =
    process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) throw new Error('Set MIGRATION_DATABASE_URL (or DATABASE_URL)');
  const client = postgres(url, { max: 1 });
  try {
    const db = drizzle(client, { schema });
    const { tenantId } = await seed(db);
    await seedWidgetDemo(db);
    console.log(`Seeded tenant ironed-out (${tenantId}).`);
  } finally {
    await client.end();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
