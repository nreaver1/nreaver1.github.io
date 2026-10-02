import { sql } from 'drizzle-orm';
import type { Db } from './types';
import { tenants } from './schema';

export const CONSUMER_TENANT_SLUG = 'ironed-out';

/** Idempotent base seed. Courses (incl. Baltimore-area) are added in M3. */
export async function seed(db: Db): Promise<{ tenantId: string }> {
  const [row] = await db
    .insert(tenants)
    .values({ slug: CONSUMER_TENANT_SLUG, name: 'Ironed Out' })
    .onConflictDoUpdate({ target: tenants.slug, set: { name: sql`excluded.name` } })
    .returning({ id: tenants.id });
  if (!row) throw new Error('Seed failed to upsert the consumer tenant');
  return { tenantId: row.id };
}
