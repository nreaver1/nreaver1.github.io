import { sql } from 'drizzle-orm';
import { seedCourses } from './courses-seed';
import { tenants } from './schema';
import type { Db } from './types';

export const CONSUMER_TENANT_SLUG = 'ironed-out';

/** Idempotent base seed: the consumer tenant and the course catalog. Runs as the schema owner. */
export async function seed(db: Db): Promise<{ tenantId: string }> {
  const [row] = await db
    .insert(tenants)
    .values({ slug: CONSUMER_TENANT_SLUG, name: 'Ironed Out' })
    .onConflictDoUpdate({ target: tenants.slug, set: { name: sql`excluded.name` } })
    .returning({ id: tenants.id });
  if (!row) throw new Error('Seed failed to upsert the consumer tenant');
  await seedCourses(db);
  return { tenantId: row.id };
}
