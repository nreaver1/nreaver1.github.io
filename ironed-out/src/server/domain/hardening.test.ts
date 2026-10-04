import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import { makeOuting, makePlayer } from '../../../tests/helpers/fixtures';
import { cspFor } from '../../proxy';
import {
  crews,
  outingEvents,
  outings,
  players,
  rateLimits,
  sessions,
  slots,
  tenants,
  users,
  verificationCodes,
} from '../db/schema';
import { withTenant } from '../db/tenant';
import { isDomainError } from '../errors';
import { OutboxMailer } from '../notify/email';
import { DemoVerifier } from '../notify/verify';
import { deleteAccount, exportAccount, FORMER_MEMBER_NAME } from './account-data';
import { signUp, type AccountsDeps } from './accounts';
import { claimAsPlayer, confirmClaim, startClaim } from './claims';
import { createCrew } from './crews';
import { getOutingView } from './outings';
import { encryptLegacyPhones, runRetention } from './retention';

let t: TestDb;
let accounts: AccountsDeps;
const ctx = { ip: '198.51.100.20', userAgent: 'vitest' };
const SECRET = 'hardening-secret-0123456789-0123456789';

beforeAll(async () => {
  t = await createTestDb();
  accounts = {
    db: t.db,
    tenantId: t.tenantId,
    mailer: new OutboxMailer(),
    isBreached: async () => false,
    appUrl: 'https://io.test',
  };
});
afterAll(async () => {
  await t.pg.close();
});
beforeEach(async () => {
  await t.db.delete(rateLimits);
});

/** What's physically stored, bypassing Drizzle's column decoding (and RLS, as the owner). */
const stored = (table: string, column: string, id: string) =>
  t.asOwner(async () => {
    const r = await t.pg.query<{ v: string | null }>(`select ${column} as v from ${table} where id = $1`, [
      id,
    ]);
    return r.rows[0]?.v ?? null;
  });

describe('phone numbers at rest', () => {
  it('are stored encrypted but still found by equality and kept unique', async () => {
    const p = await makePlayer(t, 'Pat Phone', '+14105550111');
    const raw = await stored('players', 'phone_e164', p.id);
    expect(raw).toMatch(/^e1\./);
    expect(raw).not.toContain('4105550111');
    expect(p.phoneE164).toBe('+14105550111');

    const found = await withTenant(t.db, t.tenantId, (tx) =>
      tx.select().from(players).where(eq(players.phoneE164, '+14105550111')),
    );
    expect(found.map((x) => x.id)).toEqual([p.id]);
    await expect(makePlayer(t, 'Same Number', '+14105550111')).rejects.toThrow();
  });

  it('a claim by phone finds the same player again', async () => {
    const organizer = await makePlayer(t, 'Org Anizer');
    const outingId = await makeOuting(t, organizer.id);
    const deps = { db: t.db, tenantId: t.tenantId, verifier: new DemoVerifier(t.db, SECRET) };
    const view = (await getOutingView(deps, outingId, null))!;
    const slot = view.teeTimes[0]!.slots[1]!;
    const input = { slotId: slot.id, name: 'Chris', phone: '(410) 555-0122' };
    const { demoCode } = await startClaim(deps, outingId, input, ctx);
    const first = await confirmClaim(deps, outingId, { ...input, code: demoCode }, ctx);
    expect(
      await stored('verification_codes', 'phone_e164', (await t.db.select().from(verificationCodes))[0]!.id),
    ).toMatch(/^e1\./);
    const [again] = await withTenant(t.db, t.tenantId, (tx) =>
      tx.select().from(players).where(eq(players.phoneE164, '+14105550122')),
    );
    expect(again?.id).toBe(first.playerId);
  });

  it('legacy plaintext rows still read, and the backfill seals them', async () => {
    const p = await makePlayer(t, 'Old Timer');
    await t.asOwner(() => t.pg.query(`update players set phone_e164 = '+14105550133' where id = $1`, [p.id]));
    const [before] = await withTenant(t.db, t.tenantId, (tx) =>
      tx.select().from(players).where(eq(players.id, p.id)),
    );
    expect(before?.phoneE164).toBe('+14105550133');

    expect(await encryptLegacyPhones(t.db)).toBeGreaterThanOrEqual(1);
    expect(await stored('players', 'phone_e164', p.id)).toMatch(/^e1\./);
    const [after] = await withTenant(t.db, t.tenantId, (tx) =>
      tx.select().from(players).where(eq(players.phoneE164, '+14105550133')),
    );
    expect(after?.id).toBe(p.id);
    expect(await encryptLegacyPhones(t.db)).toBe(0);
  });
});

describe('retention', () => {
  it('purges old codes, old outings (with their tee sheets) and players nobody references', async () => {
    const now = new Date();
    const organizer = await makePlayer(t, 'Ancient Organizer', '+14105550144');
    const oldOuting = await makeOuting(t, organizer.id);
    const freshOuting = await makeOuting(t, organizer.id);
    const twoYearsAgo = new Date(now.getTime() - 730 * 86_400_000);
    await t.asOwner(async () => {
      await t.pg.query(`update outings set play_date = $1 where id = $2`, [
        twoYearsAgo.toISOString().slice(0, 10),
        oldOuting,
      ]);
      await t.pg.query(`update players set created_at = $1 where id = $2`, [twoYearsAgo, organizer.id]);
      await t.db.insert(verificationCodes).values({
        phoneE164: '+14105550155',
        codeHash: 'x',
        purpose: 'claim',
        expiresAt: twoYearsAgo,
        createdAt: twoYearsAgo,
      });
    });
    const stray = await makePlayer(t, 'Stray Golfer');
    await t.asOwner(() =>
      t.pg.query(`update players set created_at = $1 where id = $2`, [twoYearsAgo, stray.id]),
    );

    const totals = await runRetention(t.db, now);
    expect(totals.outings).toBe(1);
    expect(totals.verificationCodes).toBeGreaterThanOrEqual(1);
    const left = await withTenant(t.db, t.tenantId, async (tx) => ({
      outings: (await tx.select({ id: outings.id }).from(outings)).map((o) => o.id),
      events: await tx.select().from(outingEvents).where(eq(outingEvents.outingId, oldOuting)),
      slots: await tx.select().from(slots).where(eq(slots.outingId, oldOuting)),
      stray: await tx.select().from(players).where(eq(players.id, stray.id)),
      organizer: await tx.select().from(players).where(eq(players.id, organizer.id)),
    }));
    expect(left.outings).toContain(freshOuting);
    expect(left.outings).not.toContain(oldOuting);
    expect(left.events).toEqual([]);
    expect(left.slots).toEqual([]);
    expect(left.stray).toEqual([]);
    expect(left.organizer).toHaveLength(1); // still organizes a current outing
  });

  it('honours a tenant’s own window', async () => {
    const organizer = await makePlayer(t, 'Short Memory');
    const outingId = await makeOuting(t, organizer.id);
    const fourMonthsAgo = new Date(Date.now() - 120 * 86_400_000).toISOString().slice(0, 10);
    await t.asOwner(async () => {
      await t.pg.query(`update outings set play_date = $1 where id = $2`, [fourMonthsAgo, outingId]);
      await t.db.update(tenants).set({ retentionMonths: 3 }).where(eq(tenants.id, t.tenantId));
    });
    await runRetention(t.db);
    const rows = await withTenant(t.db, t.tenantId, (tx) =>
      tx.select().from(outings).where(eq(outings.id, outingId)),
    );
    expect(rows).toEqual([]);
    await t.asOwner(() =>
      t.db.update(tenants).set({ retentionMonths: 18 }).where(eq(tenants.id, t.tenantId)),
    );
  });
});

describe('account export and deletion', () => {
  it('exports what we hold, then deletes: frees spots, drops organized outings, anonymizes history', async () => {
    const { userId } = await signUp(
      accounts,
      { name: 'Dana Delete', email: `dana-${Date.now()}@example.com`, password: 'fairway-7-iron' },
      ctx,
    );
    const [me] = await withTenant(t.db, t.tenantId, (tx) =>
      tx.select().from(players).where(eq(players.userId, userId)),
    );
    await withTenant(t.db, t.tenantId, (tx) =>
      tx
        .update(users)
        .set({ phoneE164: '+14105550166', phoneVerifiedAt: new Date() })
        .where(eq(users.id, userId)),
    );

    // Dana organizes one outing, plays in someone else's, and owns a crew.
    const mine = await makeOuting(t, me!.id);
    const host = await makePlayer(t, 'Hal Host');
    const theirs = await makeOuting(t, host.id);
    const view = (await getOutingView({ db: t.db, tenantId: t.tenantId }, theirs, null))!;
    await claimAsPlayer({ db: t.db, tenantId: t.tenantId }, theirs, me!.id, {
      slotId: view.teeTimes[0]!.slots[1]!.id,
      guests: 1,
    });
    await createCrew({ db: t.db, tenantId: t.tenantId, secret: SECRET }, userId, { name: 'Dana’s crew' });

    const data = await exportAccount(accounts, userId);
    expect(data.account).toMatchObject({ name: 'Dana Delete', phone: '+14105550166' });
    expect(data.outings_organized.map((o) => o.id)).toContain(mine);
    expect(data.spots.some((s) => s.outing_id === theirs && s.as === 'player')).toBe(true);
    expect(data.crews.map((c) => c.name)).toContain('Dana’s crew');

    const wrong = await deleteAccount(accounts, userId, { password: 'nope' }, ctx).catch((e: unknown) => e);
    expect(isDomainError(wrong) && wrong.details?.fields).toHaveProperty('password');

    await deleteAccount(accounts, userId, { password: 'fairway-7-iron' }, ctx);
    const after = await withTenant(t.db, t.tenantId, async (tx) => ({
      user: await tx.select().from(users).where(eq(users.id, userId)),
      player: await tx.select().from(players).where(eq(players.id, me!.id)),
      mine: await tx.select().from(outings).where(eq(outings.id, mine)),
      crews: await tx.select().from(crews).where(eq(crews.ownerUserId, userId)),
      released: await tx.select().from(outingEvents).where(eq(outingEvents.outingId, theirs)),
    }));
    expect(after.user).toEqual([]);
    expect(after.player[0]).toMatchObject({ displayName: FORMER_MEMBER_NAME, phoneE164: null, userId: null });
    expect(after.mine).toEqual([]);
    expect(after.crews).toEqual([]);
    expect(after.released.map((e) => e.type)).toContain('slot_released');
    const theirView = (await getOutingView({ db: t.db, tenantId: t.tenantId }, theirs, null))!;
    expect(theirView.openCount).toBe(view.openCount);
    expect(await t.db.select().from(sessions).where(eq(sessions.userId, userId))).toEqual([]);
  });
});

describe('content security policy', () => {
  it('allows scripts only by nonce (no inline scripts) and forbids framing', () => {
    const csp = cspFor('abc123', false);
    const scriptSrc = csp.split('; ').find((d) => d.startsWith('script-src'))!;
    expect(scriptSrc).toBe("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain('upgrade-insecure-requests');
    expect(cspFor('x', true)).toContain("'unsafe-eval'");
  });
});
