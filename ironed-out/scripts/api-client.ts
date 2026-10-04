/**
 * Partner API clients (operator tool; connects as the schema owner).
 *
 *   pnpm api:client create --tenant acme-golf --tenant-name "Acme Golf" --name "Acme prod" \
 *     --scopes outings:read,outings:write,players:read,webhooks:manage
 *   pnpm api:client list [--tenant acme-golf]
 *   pnpm api:client revoke <client_id>
 *
 * `create` makes the tenant if it doesn't exist and prints the secret once. Each partner gets its
 * own tenant, so Row-Level Security keeps their outings apart from everyone else's.
 */
import 'dotenv/config';
import { and, sql as dsql, eq, isNull } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../src/server/db/schema';
import { apiClients, tenants } from '../src/server/db/schema';
import { createApiClient, SCOPES, type Scope } from '../src/server/domain/api-clients';
import { CONSUMER_TENANT_SLUG } from '../src/server/db/seed';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const url =
    process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) throw new Error('Set MIGRATION_DATABASE_URL (or DATABASE_URL)');
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  const db = drizzle(sql, { schema });
  const [command, positional] = process.argv.slice(2);
  try {
    if (command === 'create') {
      const slug = arg('tenant');
      const name = arg('name');
      const scopes = (arg('scopes') ?? 'outings:read,outings:write').split(',').map((s) => s.trim());
      if (!slug || !/^[a-z0-9-]{3,40}$/.test(slug)) throw new Error('--tenant <slug> (a-z, 0-9, -)');
      if (slug === CONSUMER_TENANT_SLUG)
        throw new Error('Partners get their own tenant, not the consumer one.');
      if (!name) throw new Error('--name "<label>"');
      const bad = scopes.filter((s) => !(SCOPES as readonly string[]).includes(s));
      if (bad.length) throw new Error(`Unknown scopes: ${bad.join(', ')}. Use: ${SCOPES.join(', ')}`);
      const [tenant] = await db
        .insert(tenants)
        .values({ slug, name: arg('tenant-name') ?? slug })
        .onConflictDoUpdate({ target: tenants.slug, set: { slug } })
        .returning({ id: tenants.id });
      // The schema owner is subject to RLS too (FORCE), so act inside the tenant.
      const client = await db.transaction(async (tx) => {
        await tx.execute(dsql`select set_config('app.tenant_id', ${tenant!.id}, true)`);
        return createApiClient(tx, { tenantId: tenant!.id, name, scopes: scopes as Scope[] });
      });
      console.log(`Tenant:        ${slug} (${tenant!.id})`);
      console.log(`client_id:     ${client.clientId}`);
      console.log(`client_secret: ${client.secret}`);
      console.log('Store the secret now; it is not shown again.');
    } else if (command === 'list') {
      const slug = arg('tenant');
      const rows = await db
        .select({ tenant: tenants.slug, tenantId: tenants.id })
        .from(tenants)
        .where(slug ? eq(tenants.slug, slug) : undefined);
      for (const t of rows) {
        const clients = await db.transaction(async (tx) => {
          await tx.execute(dsql`select set_config('app.tenant_id', ${t.tenantId}, true)`);
          return tx.select().from(apiClients);
        });
        for (const c of clients) {
          console.log(
            `${t.tenant}\t${c.clientId}\t${c.name}\t${c.scopes.join(' ')}\t${c.revokedAt ? 'revoked' : 'active'}\tlast used ${c.lastUsedAt?.toISOString() ?? 'never'}`,
          );
        }
      }
    } else if (command === 'revoke' && positional) {
      const revoked = await db.transaction(async (tx) => {
        await tx.execute(dsql`select set_config('app.client_id', ${positional}, true)`);
        const [c] = await tx.select().from(apiClients).where(eq(apiClients.clientId, positional));
        if (!c) return 0;
        await tx.execute(dsql`select set_config('app.tenant_id', ${c.tenantId}, true)`);
        const r = await tx
          .update(apiClients)
          .set({ revokedAt: new Date() })
          .where(and(eq(apiClients.id, c.id), isNull(apiClients.revokedAt)))
          .returning({ id: apiClients.id });
        return r.length;
      });
      console.log(
        revoked
          ? `Revoked ${positional}. Its tokens stop working immediately.`
          : 'No active client with that id.',
      );
    } else {
      console.log('Usage: pnpm api:client create|list|revoke (see the top of scripts/api-client.ts)');
      process.exitCode = 1;
    }
  } finally {
    await sql.end();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
