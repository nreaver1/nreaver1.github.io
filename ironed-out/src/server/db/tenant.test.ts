import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import { tenants, users } from './schema';
import { seed } from './seed';
import { withTenant } from './tenant';

let t: TestDb;
let tenantA: string;
let tenantB: string;

const newUser = (tenantId: string, email: string) => ({
  tenantId,
  email,
  name: 'Test',
  passwordHash: 'not-a-real-hash',
});

beforeAll(async () => {
  t = await createTestDb();
  tenantA = t.tenantId;
  const [b] = await t.asOwner(() =>
    t.db.insert(tenants).values({ slug: 'partner-b', name: 'Partner B' }).returning(),
  );
  tenantB = b!.id;
});

afterAll(async () => {
  await t.pg.close();
});

describe('withTenant + row-level security', () => {
  it('only shows rows that belong to the current tenant', async () => {
    await withTenant(t.db, tenantA, (tx) => tx.insert(users).values(newUser(tenantA, 'mike@example.com')));
    await withTenant(t.db, tenantB, (tx) => tx.insert(users).values(newUser(tenantB, 'jen@example.com')));

    const seenByA = await withTenant(t.db, tenantA, (tx) => tx.select().from(users));
    const seenByB = await withTenant(t.db, tenantB, (tx) => tx.select().from(users));
    expect(seenByA.map((u) => u.email)).toEqual(['mike@example.com']);
    expect(seenByB.map((u) => u.email)).toEqual(['jen@example.com']);
  });

  it('returns nothing when no tenant is set', async () => {
    expect(await t.db.select().from(users)).toEqual([]);
  });

  it("rejects writing a row into another tenant's space", async () => {
    await expect(
      withTenant(t.db, tenantA, (tx) => tx.insert(users).values(newUser(tenantB, 'sneaky@example.com'))),
    ).rejects.toThrow();
  });

  it("cannot update or delete another tenant's rows", async () => {
    const updated = await withTenant(t.db, tenantA, (tx) =>
      tx.update(users).set({ name: 'Hacked' }).where(eq(users.email, 'jen@example.com')).returning(),
    );
    const deleted = await withTenant(t.db, tenantA, (tx) =>
      tx.delete(users).where(eq(users.email, 'jen@example.com')).returning(),
    );
    expect(updated).toEqual([]);
    expect(deleted).toEqual([]);
  });

  it('scopes the tenant setting to the transaction', async () => {
    await withTenant(t.db, tenantA, async () => undefined);
    const res = await t.pg.query<{ v: string | null }>(`select current_setting('app.tenant_id', true) as v`);
    expect(res.rows[0]?.v ?? '').toBe('');
  });

  it('treats emails case-insensitively within a tenant', async () => {
    await expect(
      withTenant(t.db, tenantA, (tx) => tx.insert(users).values(newUser(tenantA, 'MIKE@example.com'))),
    ).rejects.toThrow();
  });

  it('rejects a malformed tenant id before touching the database', async () => {
    await expect(withTenant(t.db, "x' or 1=1 --", async () => 1)).rejects.toThrow();
  });

  it('does not let the app role manage tenants', async () => {
    await expect(t.db.insert(tenants).values({ slug: 'evil', name: 'Evil' })).rejects.toThrow();
    expect((await t.db.select().from(tenants)).length).toBe(2);
  });
});

describe('rls coverage', () => {
  it('every table with a tenant_id column has RLS enabled, forced and a policy', async () => {
    const res = await t.pg.query<{ table: string; rls: boolean; forced: boolean; policies: number }>(`
      select c.relname as table, c.relrowsecurity as rls, c.relforcerowsecurity as forced,
             (select count(*)::int from pg_policies p where p.tablename = c.relname) as policies
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
      join information_schema.columns col on col.table_name = c.relname and col.column_name = 'tenant_id'
      where c.relkind = 'r'
    `);
    expect(res.rows.length).toBeGreaterThan(1);
    for (const r of res.rows) {
      expect({ table: r.table, rls: r.rls, forced: r.forced, hasPolicy: r.policies > 0 }).toEqual({
        table: r.table,
        rls: true,
        forced: true,
        hasPolicy: true,
      });
    }
  });
});

describe('seed', () => {
  it('is idempotent', async () => {
    const again = await t.asOwner(() => seed(t.db));
    expect(again.tenantId).toBe(tenantA);
  });
});
