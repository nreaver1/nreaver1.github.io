import { sql } from 'drizzle-orm';
import { seedCourses } from './courses-seed';
import { randomToken, sha256 } from '../security/tokens';
import { apiClients, tenants } from './schema';
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

/** The pretend booking site behind /developers/widget (its own tenant, like any partner). */
export const WIDGET_DEMO_TENANT_SLUG = 'widget-demo';
export const WIDGET_DEMO_CLIENT_ID = 'ioc_widget_demo';

/**
 * Idempotent: the demo partner tenant and an API client for it. The client's secret is random and
 * thrown away; the demo page mints widget tokens server-side and never calls the API with it.
 */
export async function seedWidgetDemo(db: Db): Promise<void> {
  const [tenant] = await db
    .insert(tenants)
    .values({ slug: WIDGET_DEMO_TENANT_SLUG, name: 'Fairway Finder (demo)' })
    .onConflictDoUpdate({ target: tenants.slug, set: { name: sql`excluded.name` } })
    .returning({ id: tenants.id });
  if (!tenant) throw new Error('Seed failed to upsert the widget demo tenant');
  // The schema owner is subject to RLS too (FORCE), so act inside the tenant.
  await db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.tenant_id', ${tenant.id}, true)`);
    await tx
      .insert(apiClients)
      .values({
        tenantId: tenant.id,
        name: 'Widget demo',
        clientId: WIDGET_DEMO_CLIENT_ID,
        secretHash: sha256(randomToken(40)),
        scopes: ['outings:read', 'outings:write'],
      })
      .onConflictDoNothing();
  });
}
