import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import { courseId, futureSaturday, makeOuting, makePlayer } from '../../../tests/helpers/fixtures';
import { OutingListSchema, OutingSchema } from '../api/openapi';
import { apiClients, rateLimits, tenants, webhookDeliveries } from '../db/schema';
import { withTenant } from '../db/tenant';
import { isDomainError } from '../errors';
import { signJwt, verifyJwt } from '../security/jwt';
import { open, seal } from '../security/secretbox';
import {
  authenticateAccessToken,
  createApiClient,
  issueAccessToken,
  type ApiCaller,
  type ApiClientDeps,
} from './api-clients';
import { claimAsPlayer } from './claims';
import { beginIdempotent, finishIdempotent } from './idempotency';
import { createInviteLink, resolveInviteAnyTenant } from './invites';
import {
  claimPartnerSlot,
  createPartnerInviteLink,
  createPartnerOuting,
  getOutingResource,
  listOutingResources,
  releasePartnerSlot,
  updatePartnerOuting,
  updatePartnerTeeTime,
  type PartnerDeps,
} from './partner-outings';
import {
  createWebhookEndpoint,
  deliverWebhooks,
  isPrivateAddress,
  listDeliveries,
  updateWebhookEndpoint,
  verifySignature,
  type WebhookRequest,
} from './webhooks';

const SECRET = 'test-secret-0123456789-0123456789-abc';
const APP_URL = 'https://io.test';

let t: TestDb;
let partnerTenant: string;
let otherTenant: string;
let authDeps: ApiClientDeps;
let deps: PartnerDeps;
let caller: ApiCaller;
let creds: { clientId: string; secret: string };

const ALL_SCOPES = ['outings:read', 'outings:write', 'players:read', 'webhooks:manage'] as const;

async function newTenant(slug: string) {
  const [row] = await t.asOwner(() => t.db.insert(tenants).values({ slug, name: slug }).returning());
  return row!.id;
}

async function newClient(tenantId: string, scopes: (typeof ALL_SCOPES)[number][] = [...ALL_SCOPES]) {
  return t.asOwner(() => createApiClient(t.db, { tenantId, name: 'Test client', scopes }));
}

async function login(c: { clientId: string; secret: string }, scope?: string) {
  const tok = await issueAccessToken(
    authDeps,
    { grant_type: 'client_credentials', client_id: c.clientId, client_secret: c.secret, scope },
    '203.0.113.9',
  );
  return (await authenticateAccessToken(authDeps, tok.access_token))!;
}

async function expectError(p: Promise<unknown>, code: string, reason?: string) {
  try {
    await p;
  } catch (e) {
    expect(isDomainError(e)).toBe(true);
    if (isDomainError(e)) {
      expect(e.code).toBe(code);
      if (reason) expect(e.details?.reason ?? e.details?.oauth).toBe(reason);
    }
    return e;
  }
  throw new Error(`expected a ${code} error`);
}

const baseOuting = async (extra: Record<string, unknown> = {}) => ({
  course_id: await courseId(t),
  play_date: futureSaturday(),
  tee_times: { first: '07:40', count: 2, players_each: 4, interval_minutes: 10 },
  price_cents: 4500,
  note: 'Booked through Acme',
  external_ref: 'RES-1001',
  organizer: { name: 'Pat Partner', phone: '(410) 555-0101' },
  ...extra,
});

beforeAll(async () => {
  t = await createTestDb();
  partnerTenant = await newTenant('acme-golf');
  otherTenant = await newTenant('other-partner');
  authDeps = { db: t.db, secret: SECRET, appUrl: APP_URL };
  deps = { db: t.db, tenantId: partnerTenant, secret: SECRET, appUrl: APP_URL };
  creds = await newClient(partnerTenant);
  caller = await login(creds);
});
afterAll(async () => {
  await t.pg.close();
});
beforeEach(async () => {
  await t.db.delete(rateLimits);
});

describe('access tokens', () => {
  it('signs and verifies, and rejects tampering and expiry', () => {
    const now = new Date('2026-10-04T12:00:00Z');
    const iat = Math.floor(now.getTime() / 1000);
    const claims = {
      iss: APP_URL,
      aud: 'ironed-out-api' as const,
      sub: '0199a000-0000-7000-8000-000000000001',
      tid: '0199a000-0000-7000-8000-000000000002',
      scope: 'outings:read',
      iat,
      exp: iat + 900,
      jti: 'abc',
    };
    const jwt = signJwt(SECRET, claims);
    expect(verifyJwt(SECRET, jwt, now)).toEqual(claims);
    expect(verifyJwt('another-secret-0123456789-0123456789', jwt, now)).toBeNull();
    const [h, , s] = jwt.split('.');
    const forged = Buffer.from(JSON.stringify({ ...claims, scope: 'webhooks:manage' })).toString('base64url');
    expect(verifyJwt(SECRET, `${h}.${forged}.${s}`, now)).toBeNull();
    expect(verifyJwt(SECRET, jwt, new Date(now.getTime() + 16 * 60_000))).toBeNull();
  });

  it('issues tokens for valid client credentials only', async () => {
    const tok = await issueAccessToken(
      authDeps,
      { grant_type: 'client_credentials', client_id: creds.clientId, client_secret: creds.secret },
      null,
    );
    expect(tok).toMatchObject({ token_type: 'Bearer', expires_in: 900 });
    expect(tok.scope.split(' ').sort()).toEqual([...ALL_SCOPES].sort());

    await expectError(
      issueAccessToken(
        authDeps,
        { grant_type: 'client_credentials', client_id: creds.clientId, client_secret: 'wrong' },
        null,
      ),
      'unauthorized',
      'invalid_client',
    );
    await expectError(
      issueAccessToken(
        authDeps,
        { grant_type: 'client_credentials', client_id: 'nope', client_secret: 'x' },
        null,
      ),
      'unauthorized',
      'invalid_client',
    );
    await expectError(
      issueAccessToken(
        authDeps,
        { grant_type: 'password', client_id: creds.clientId, client_secret: creds.secret },
        null,
      ),
      'invalid_input',
      'unsupported_grant_type',
    );
  });

  it('narrows to the requested scopes and refuses ones the client lacks', async () => {
    const reader = await newClient(partnerTenant, ['outings:read']);
    expect((await login(reader)).scopes).toEqual(['outings:read']);
    expect((await login(creds, 'outings:read')).scopes).toEqual(['outings:read']);
    await expectError(login(reader, 'outings:write'), 'invalid_input', 'invalid_scope');
  });

  it('stops accepting tokens as soon as the client is revoked', async () => {
    const c = await newClient(partnerTenant);
    const tok = await issueAccessToken(
      authDeps,
      { grant_type: 'client_credentials', client_id: c.clientId, client_secret: c.secret },
      null,
    );
    expect(await authenticateAccessToken(authDeps, tok.access_token)).not.toBeNull();
    await withTenant(t.db, partnerTenant, (tx) =>
      tx.update(apiClients).set({ revokedAt: new Date() }).where(eq(apiClients.clientId, c.clientId)),
    );
    expect(await authenticateAccessToken(authDeps, tok.access_token)).toBeNull();
    await expectError(
      issueAccessToken(
        authDeps,
        { grant_type: 'client_credentials', client_id: c.clientId, client_secret: c.secret },
        null,
      ),
      'unauthorized',
    );
  });

  it("doesn't let the app see other tenants' clients", async () => {
    expect(await t.db.select().from(apiClients)).toEqual([]);
    const visible = await withTenant(t.db, otherTenant, (tx) => tx.select().from(apiClients));
    expect(visible).toEqual([]);
  });
});

describe('webhook secrets at rest', () => {
  it('round-trips and detects tampering or the wrong key', () => {
    const sealed = seal(SECRET, 'webhook-secret', 'whsec_abc');
    expect(sealed).not.toContain('whsec_abc');
    expect(open(SECRET, 'webhook-secret', sealed)).toBe('whsec_abc');
    expect(() => open(SECRET, 'other-purpose', sealed)).toThrow();
    const parts = sealed.split('.');
    parts[3] = Buffer.from('whsec_xyz').toString('base64url');
    expect(() => open(SECRET, 'webhook-secret', parts.join('.'))).toThrow();
  });
});

describe('idempotency keys', () => {
  it('replays the stored response, rejects a different request, and blocks while in flight', async () => {
    const d = { db: t.db, tenantId: partnerTenant };
    expect(await beginIdempotent(d, caller.id, 'key-1', 'hash-a')).toBeNull();
    await expectError(beginIdempotent(d, caller.id, 'key-1', 'hash-a'), 'conflict', 'idempotency_in_flight');
    await finishIdempotent(d, caller.id, 'key-1', { status: 201, body: { id: 'x' } });
    expect(await beginIdempotent(d, caller.id, 'key-1', 'hash-a')).toEqual({
      status: 201,
      body: { id: 'x' },
    });
    await expectError(
      beginIdempotent(d, caller.id, 'key-1', 'hash-b'),
      'invalid_input',
      'idempotency_mismatch',
    );
  });

  it('forgets server errors so the client can retry', async () => {
    const d = { db: t.db, tenantId: partnerTenant };
    expect(await beginIdempotent(d, caller.id, 'key-500', 'h')).toBeNull();
    await finishIdempotent(d, caller.id, 'key-500', { status: 500, body: null });
    expect(await beginIdempotent(d, caller.id, 'key-500', 'h')).toBeNull();
  });

  it('takes over a key whose first attempt died', async () => {
    const d = { db: t.db, tenantId: partnerTenant };
    const then = new Date();
    expect(await beginIdempotent({ ...d, now: () => then }, caller.id, 'key-stale', 'h')).toBeNull();
    const later = new Date(then.getTime() + 2 * 60_000);
    expect(await beginIdempotent({ ...d, now: () => later }, caller.id, 'key-stale', 'h')).toBeNull();
  });
});

describe('partner outings', () => {
  it('creates an outing with pre-filled players and an invite link', async () => {
    const outing = await createPartnerOuting(
      deps,
      caller,
      await baseOuting({ players: [{ name: 'Sam Swing' }, { name: 'Lee Long', phone: '4105550102' }] }),
    );
    expect(() => OutingSchema.parse(outing)).not.toThrow();
    expect(outing).toMatchObject({
      external_ref: 'RES-1001',
      price_cents: 4500,
      total_count: 8,
      open_count: 5,
      organizer: { name: 'Pat Partner' },
    });
    expect(outing.invite_url).toMatch(new RegExp(`^${APP_URL}/t/[0-9A-Za-z]{22}$`));
    const first = outing.tee_times[0]!;
    expect(first.slots.map((s) => s.player?.name ?? null)).toEqual([
      'Pat Partner',
      'Sam Swing',
      'Lee Long',
      null,
    ]);
    // 07:40 local at the course (Eastern).
    expect(
      new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        timeZone: outing.timezone,
      }).format(new Date(first.starts_at)),
    ).toBe('7:40 AM');
  });

  it('hides names without players:read', async () => {
    const outing = await createPartnerOuting(deps, caller, await baseOuting({ external_ref: 'RES-NAMES' }));
    const reader = await login(creds, 'outings:read');
    const r = await getOutingResource(deps, reader, outing.id);
    expect(r.organizer).toBeUndefined();
    expect(r.tee_times[0]!.slots[0]).toEqual({ id: expect.any(String), position: 0, status: 'taken' });
  });

  it('rejects bad input with field errors', async () => {
    const e = await expectError(
      createPartnerOuting(deps, caller, await baseOuting({ tee_times: { first: '7:40am' } })),
      'invalid_input',
    );
    expect(isDomainError(e) && e.details?.fields).toHaveProperty('tee_times');
    await expectError(
      createPartnerOuting(
        deps,
        caller,
        await baseOuting({ players: Array.from({ length: 8 }, (_, i) => ({ name: `P${i}` })) }),
      ),
      'invalid_input',
    );
  });

  it('lists newest first with a cursor and filters by external_ref', async () => {
    const d = { ...deps, tenantId: otherTenant };
    const c = await login(await newClient(otherTenant));
    const ids: string[] = [];
    for (let i = 0; i < 3; i++)
      ids.push((await createPartnerOuting(d, c, await baseOuting({ external_ref: `R-${i}` }))).id);
    const page1 = await listOutingResources(d, c, { limit: '2' });
    expect(() => OutingListSchema.parse(page1)).not.toThrow();
    expect(page1.data.map((o) => o.id)).toEqual([ids[2], ids[1]]);
    const page2 = await listOutingResources(d, c, { limit: '2', cursor: page1.next_cursor! });
    expect(page2.data.map((o) => o.id)).toEqual([ids[0]]);
    expect(page2.next_cursor).toBeNull();
    expect((await listOutingResources(d, c, { external_ref: 'R-1' })).data.map((o) => o.id)).toEqual([
      ids[1],
    ]);
  });

  it('keeps tenants apart', async () => {
    const mine = await createPartnerOuting(deps, caller, await baseOuting({ external_ref: 'RES-MINE' }));
    const other = await login(await newClient(otherTenant));
    const otherDeps = { ...deps, tenantId: otherTenant };
    await expectError(getOutingResource(otherDeps, other, mine.id), 'not_found');
    await expectError(releasePartnerSlot(otherDeps, other, mine.tee_times[0]!.slots[1]!.id), 'not_found');
    expect((await listOutingResources(otherDeps, other, { external_ref: 'RES-MINE' })).data).toEqual([]);
    // Consumer outings aren't visible to partners either.
    const mike = await makePlayer(t, 'Mike Consumer');
    const consumerOuting = await makeOuting(t, mike.id);
    await expectError(getOutingResource(deps, caller, consumerOuting), 'not_found');
  });

  it('claims, refuses a taken spot with the current tee sheet, and releases', async () => {
    const outing = await createPartnerOuting(deps, caller, await baseOuting({ external_ref: 'RES-CLAIM' }));
    const slot = outing.tee_times[0]!.slots[1]!;
    const r = await claimPartnerSlot(deps, caller, slot.id, { player: { name: 'Jo Birdie' }, guests: 1 });
    expect(r.guest_count).toBe(1);
    expect(r.outing.open_count).toBe(outing.open_count - 2);

    const e = await expectError(
      claimPartnerSlot(deps, caller, slot.id, { player: { name: 'Late Larry' } }),
      'conflict',
      'slot_taken',
    );
    expect(isDomainError(e) && OutingSchema.parse(e.details?.outing).id).toBe(outing.id);

    const after = await releasePartnerSlot(deps, caller, slot.id);
    expect(after.open_count).toBe(outing.open_count);
    // The organizer's own spot can't be released.
    await expectError(releasePartnerSlot(deps, caller, outing.tee_times[0]!.slots[0]!.id), 'conflict');
  });

  it('updates details, resizes tee times, and locks', async () => {
    const outing = await createPartnerOuting(deps, caller, await baseOuting({ external_ref: 'RES-EDIT' }));
    const updated = await updatePartnerOuting(deps, caller, outing.id, {
      note: 'Carts included',
      price_cents: null,
    });
    expect(updated).toMatchObject({ note: 'Carts included', price_cents: null });
    expect((await updatePartnerOuting(deps, caller, outing.id, { price_cents: 5000 })).note).toBe(
      'Carts included',
    );

    const tee = outing.tee_times[1]!;
    expect((await updatePartnerTeeTime(deps, caller, tee.id, { capacity: 2 })).tee_times[1]!.capacity).toBe(
      2,
    );
    expect(
      (await updatePartnerTeeTime(deps, caller, tee.id, { capacity: 5 })).tee_times[1]!.slots,
    ).toHaveLength(5);

    await updatePartnerOuting(deps, caller, outing.id, { locked: true });
    await expectError(
      claimPartnerSlot(deps, caller, tee.slots[0]!.id, { player: { name: 'Too Late' } }),
      'conflict',
      'locked',
    );
  });

  it('makes extra invite links that resolve in the partner tenant only', async () => {
    const outing = await createPartnerOuting(deps, caller, await baseOuting({ external_ref: 'RES-LINK' }));
    const link = await createPartnerInviteLink(deps, caller, outing.id, {});
    const token = link.url.split('/t/')[1]!;
    expect(await resolveInviteAnyTenant({ db: t.db, secret: SECRET }, token)).toEqual({
      tenantId: partnerTenant,
      outingId: outing.id,
    });
    expect(await resolveInviteAnyTenant({ db: t.db, secret: SECRET }, 'NotARealToken123456789')).toBeNull();
  });
});

describe('webhooks', () => {
  const sent: WebhookRequest[] = [];
  let status = 200;
  const send = async (req: WebhookRequest) => {
    sent.push(req);
    return status;
  };
  const deliver = (now = new Date()) => deliverWebhooks({ db: t.db, secret: SECRET, send, now: () => now });
  const wdeps = () => ({ db: t.db, tenantId: partnerTenant, secret: SECRET });

  beforeEach(() => {
    sent.length = 0;
    status = 200;
  });

  it('only accepts public https URLs', async () => {
    for (const url of [
      'http://example.com/h',
      'https://localhost/h',
      'https://10.0.0.5/h',
      'https://user:pw@example.com/h',
    ]) {
      await expectError(
        createWebhookEndpoint(wdeps(), 'test', { url, events: ['slot.claimed'] }),
        'invalid_input',
      );
    }
    expect(isPrivateAddress('192.168.1.1')).toBe(true);
    expect(isPrivateAddress('::ffff:127.0.0.1')).toBe(true);
    expect(isPrivateAddress('93.184.216.34')).toBe(false);
  });

  it('signs deliveries, sends outing.full when the last spot goes, and records them', async () => {
    const ep = await createWebhookEndpoint(wdeps(), 'test', {
      url: 'https://hooks.example.com/io',
      events: ['slot.claimed', 'outing.full'],
    });
    expect(ep.secret).toMatch(/^whsec_/);
    const outing = await createPartnerOuting(
      deps,
      caller,
      await baseOuting({
        external_ref: 'RES-HOOK',
        tee_times: { first: '08:00', count: 1, players_each: 2 },
      }),
    );
    await claimPartnerSlot(deps, caller, outing.tee_times[0]!.slots[1]!.id, { player: { name: 'Kim Chip' } });
    const now = new Date();
    expect(await deliver(now)).toMatchObject({ delivered: 2 });

    const types = sent.map((r) => JSON.parse(r.body).type).sort();
    expect(types).toEqual(['outing.full', 'slot.claimed']);
    const claimed = sent.find((r) => JSON.parse(r.body).type === 'slot.claimed')!;
    expect(verifySignature(ep.secret, claimed.body, claimed.headers['Ironed-Signature']!, now)).toBe(true);
    expect(verifySignature(ep.secret, `${claimed.body} `, claimed.headers['Ironed-Signature']!, now)).toBe(
      false,
    );
    expect(
      verifySignature(
        ep.secret,
        claimed.body,
        claimed.headers['Ironed-Signature']!,
        new Date(now.getTime() + 10 * 60_000),
      ),
    ).toBe(false);
    expect(JSON.parse(claimed.body).data).toMatchObject({
      outing_id: outing.id,
      external_ref: 'RES-HOOK',
      player: { name: 'Kim Chip' },
      guest_count: 0,
    });
    expect(claimed.body).not.toMatch(/555/);

    const log = await listDeliveries(wdeps(), ep.id);
    expect(log.every((d) => d.status === 'delivered')).toBe(true);
    await updateWebhookEndpoint(wdeps(), 'test', ep.id, { enabled: false });
  });

  it('retries failures with backoff and gives up after a day', async () => {
    const ep = await createWebhookEndpoint(wdeps(), 'test', {
      url: 'https://hooks.example.com/flaky',
      events: ['outing.locked'],
    });
    const outing = await createPartnerOuting(deps, caller, await baseOuting({ external_ref: 'RES-RETRY' }));
    await updatePartnerOuting(deps, caller, outing.id, { locked: true });
    status = 500;
    const t0 = new Date();
    expect(await deliver(t0)).toMatchObject({ retry: 1 });
    expect(await deliver(new Date(t0.getTime() + 30_000))).toMatchObject({ retry: 0 }); // not due yet
    expect(await deliver(new Date(t0.getTime() + 61_000))).toMatchObject({ retry: 1 });
    const [d] = await listDeliveries(wdeps(), ep.id);
    expect(d).toMatchObject({ status: 'pending', attempts: 2, last_status: 500, last_error: 'HTTP 500' });
    expect(await deliver(new Date(t0.getTime() + 25 * 3_600_000))).toMatchObject({ failed: 1 });
    expect((await listDeliveries(wdeps(), ep.id))[0]!.status).toBe('failed');
    await updateWebhookEndpoint(wdeps(), 'test', ep.id, { enabled: false });
  });

  it("never sends another tenant's events", async () => {
    await createWebhookEndpoint(wdeps(), 'test', {
      url: 'https://hooks.example.com/all',
      events: ['slot.claimed'],
    });
    const mike = await makePlayer(t, 'Mike Consumer');
    const jen = await makePlayer(t, 'Jen Consumer');
    const consumerOuting = await makeOuting(t, mike.id);
    const link = await createInviteLink(
      { db: t.db, tenantId: t.tenantId, secret: SECRET },
      { playerId: mike.id },
      consumerOuting,
      null,
    );
    expect(link.token).toBeTruthy();
    const [open] = await withTenant(t.db, t.tenantId, async (tx) =>
      tx.query.slots.findMany({
        where: (s, { and, eq: e, isNull }) => and(e(s.outingId, consumerOuting), isNull(s.playerId)),
      }),
    );
    await claimAsPlayer({ db: t.db, tenantId: t.tenantId }, consumerOuting, jen.id, { slotId: open!.id });
    const pending = await withTenant(t.db, partnerTenant, (tx) =>
      tx.select().from(webhookDeliveries).where(eq(webhookDeliveries.status, 'pending')),
    );
    expect(pending).toEqual([]);
  });
});
