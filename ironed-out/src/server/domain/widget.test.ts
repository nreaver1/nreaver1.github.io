import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import { courseId, futureSaturday } from '../../../tests/helpers/fixtures';
import { OutingSchema, WidgetTokenSchema } from '../api/openapi';
import { apiClients, auditLog, outings, rateLimits, tenants } from '../db/schema';
import { seedWidgetDemo, WIDGET_DEMO_CLIENT_ID, WIDGET_DEMO_TENANT_SLUG } from '../db/seed';
import { withTenant } from '../db/tenant';
import { isDomainError } from '../errors';
import { createApiClient, findActiveClient, type ApiCaller } from './api-clients';
import { createWidgetToken, demoWidgetToken, previewWidget, redeemWidget, type WidgetDeps } from './widget';

const SECRET = 'test-secret-0123456789-0123456789-abc';
const APP_URL = 'https://io.test';
const IP = { ip: '203.0.113.7' };

let t: TestDb;
let deps: WidgetDeps;
let tenantId: string;
let caller: ApiCaller;

const booking = async (extra: Record<string, unknown> = {}) => ({
  course_id: await courseId(t),
  play_date: futureSaturday(),
  tee_times: { first: '07:40', count: 3, players_each: 4, interval_minutes: 10 },
  external_ref: 'RES-W1',
  organizer: { name: 'Pat Booker', phone: '(410) 555-0177' },
  ...extra,
});

async function expectError(p: Promise<unknown>, code: string) {
  try {
    await p;
  } catch (e) {
    expect(isDomainError(e) && e.code).toBe(code);
    return e;
  }
  throw new Error(`expected a ${code} error`);
}

async function newCaller(slug: string, scopes: ApiCaller['scopes'] = ['outings:read', 'outings:write']) {
  const [tenant] = await t.asOwner(() =>
    t.db
      .insert(tenants)
      .values({ slug, name: `${slug} Golf` })
      .returning({ id: tenants.id }),
  );
  const c = await t.asOwner(() => createApiClient(t.db, { tenantId: tenant!.id, name: 'web', scopes }));
  const found = (await findActiveClient(t.db, tenant!.id, c.id))!;
  const { tenantName: _, ...rest } = found;
  return rest;
}

beforeAll(async () => {
  t = await createTestDb();
  deps = { db: t.db, secret: SECRET, appUrl: APP_URL };
  caller = await newCaller('widget-partner');
  tenantId = caller.tenantId;
});
afterAll(async () => {
  await t.pg.close();
});
beforeEach(async () => {
  await t.db.delete(rateLimits);
});

describe('widget tokens', () => {
  it('seals the booking: no names or numbers in the URL', async () => {
    const res = await createWidgetToken(deps, caller, await booking());
    expect(() => WidgetTokenSchema.parse(res)).not.toThrow();
    expect(res.url).toBe(`${APP_URL}/w/${res.token}`);
    expect(res.url).toMatch(/^https:\/\/io\.test\/w\/[\w.-]+$/);
    const decoded = res.token
      .split('.')
      .map((p) => Buffer.from(p, 'base64url').toString('latin1'))
      .join('');
    expect(decoded).not.toContain('Pat Booker');
    expect(decoded).not.toContain('555');
  });

  it('checks the booking when the token is made', async () => {
    await expectError(
      createWidgetToken(deps, caller, await booking({ play_date: '2020-01-04' })),
      'invalid_input',
    );
    await expectError(
      createWidgetToken(deps, caller, await booking({ organizer: { name: 'X', phone: '12' } })),
      'invalid_input',
    );
    await expectError(
      createWidgetToken(deps, caller, await booking({ course_id: '00000000-0000-4000-8000-000000000000' })),
      'invalid_input',
    );
    await expectError(
      createWidgetToken(deps, caller, await booking({ expires_in: 90_000 })),
      'invalid_input',
    );
  });

  it('previews, then makes the outing exactly once', async () => {
    const { token } = await createWidgetToken(deps, caller, await booking({ external_ref: 'RES-ONCE' }));
    const before = await previewWidget(deps, token);
    expect(before).toMatchObject({
      partnerName: 'widget-partner Golf',
      course: { name: 'Mount Pleasant Golf Course' },
      firstTeeMinutes: 460,
      teeTimeCount: 3,
      totalSpots: 12,
      organizerName: 'Pat Booker',
      outing: null,
    });

    const first = await redeemWidget(deps, token, IP);
    expect(() => OutingSchema.parse(first)).not.toThrow();
    expect(first).toMatchObject({ external_ref: 'RES-ONCE', total_count: 12, open_count: 11 });
    expect(first.invite_url).toMatch(/\/t\/[0-9A-Za-z]{22}$/);

    const again = await redeemWidget(deps, token, IP);
    expect(again.id).toBe(first.id);
    const rows = await withTenant(t.db, tenantId, (tx) =>
      tx.select({ id: outings.id }).from(outings).where(eq(outings.externalRef, 'RES-ONCE')),
    );
    expect(rows).toHaveLength(1);
    expect((await previewWidget(deps, token))!.outing?.id).toBe(first.id);

    const [audit] = await withTenant(t.db, tenantId, (tx) =>
      tx
        .select()
        .from(auditLog)
        .where(eq(auditLog.target, `outing:${first.id}`)),
    );
    expect(audit).toMatchObject({ actor: `client:${caller.id}`, action: 'api.outing_created' });
    expect(audit!.meta).toMatchObject({ via: 'widget' });
  });

  it('rejects tampered, expired and foreign-key tokens', async () => {
    const { token } = await createWidgetToken(deps, caller, await booking({ expires_in: 60 }));
    const parts = token.split('.');
    const last = parts[3]!;
    parts[3] = (last[0] === 'A' ? 'B' : 'A') + last.slice(1);
    expect(await previewWidget(deps, parts.join('.'))).toBeNull();
    expect(await previewWidget({ ...deps, secret: `${SECRET}-other` }, token)).toBeNull();
    expect(await previewWidget(deps, 'not-a-token')).toBeNull();
    const later = { ...deps, now: () => new Date(Date.now() + 61_000) };
    expect(await previewWidget(later, token)).toBeNull();
    await expectError(redeemWidget(later, token, IP), 'gone');
  });

  it('stops working when the client is revoked or loses outings:write', async () => {
    const other = await newCaller('revoked-partner');
    const { token } = await createWidgetToken(deps, other, await booking());
    expect(await previewWidget(deps, token)).not.toBeNull();
    await withTenant(t.db, other.tenantId, (tx) =>
      tx.update(apiClients).set({ revokedAt: new Date() }).where(eq(apiClients.id, other.id)),
    );
    expect(await previewWidget(deps, token)).toBeNull();
    await expectError(redeemWidget(deps, token, IP), 'gone');

    const reader = await newCaller('reader-partner', ['outings:read']);
    const { token: t2 } = await createWidgetToken(deps, reader, await booking());
    expect(await previewWidget(deps, t2)).toBeNull();
  });

  it('limits redemptions per IP', async () => {
    for (let i = 0; i < 20; i++) {
      const { token } = await createWidgetToken(deps, caller, await booking({ external_ref: `RES-L${i}` }));
      await redeemWidget(deps, token, { ip: '198.51.100.4' });
    }
    const { token } = await createWidgetToken(deps, caller, await booking());
    await expectError(redeemWidget(deps, token, { ip: '198.51.100.4' }), 'rate_limited');
  });

  it('mints demo tokens for the seeded demo partner', async () => {
    await t.asOwner(() => seedWidgetDemo(t.db));
    await t.asOwner(() => seedWidgetDemo(t.db)); // idempotent
    const demo = (await demoWidgetToken(deps, WIDGET_DEMO_TENANT_SLUG, WIDGET_DEMO_CLIENT_ID))!;
    expect(demo.url).toContain('/w/');
    expect(await previewWidget(deps, demo.token)).toMatchObject({
      partnerName: 'Fairway Finder (demo)',
      totalSpots: 12,
      organizerName: 'Mike Golfer',
    });
    expect(await demoWidgetToken(deps, 'no-such-tenant', WIDGET_DEMO_CLIENT_ID)).toBeNull();
  });
});
