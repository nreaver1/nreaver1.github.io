import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { formatTime } from '@/lib/format';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import { makeOuting, makePlayer } from '../../../tests/helpers/fixtures';
import { outingEvents, players, rateLimits } from '../db/schema';
import { withTenant } from '../db/tenant';
import { DemoVerifier } from '../notify/verify';
import { claimAsPlayer, confirmClaim, dropOut, startClaim, type ClaimDeps } from './claims';
import {
  createInviteLink,
  ensureInviteLink,
  resolveInviteToken,
  revokeInviteLink,
  rotateInviteLink,
  type InviteDeps,
} from './invites';
import { getOutingView, setLocked, type OutingsDeps } from './outings';

let t: TestDb;
let deps: ClaimDeps & OutingsDeps;
let inviteDeps: InviteDeps;
let mike: { id: string };
const ctx = { ip: '198.51.100.4', userAgent: 'vitest' };
const SECRET = 'test-secret-0123456789-0123456789-abc';

beforeAll(async () => {
  t = await createTestDb();
  deps = { db: t.db, tenantId: t.tenantId, verifier: new DemoVerifier(t.db, SECRET) };
  inviteDeps = { db: t.db, tenantId: t.tenantId, secret: SECRET };
  mike = await makePlayer(t, 'Mike Golfer');
});
afterAll(async () => {
  await t.pg.close();
});
beforeEach(async () => {
  await t.db.delete(rateLimits);
});

const view = (outingId: string, viewer: string | null = null) =>
  getOutingView(deps, outingId, viewer).then((v) => v!);
const openSlot = async (outingId: string, tee = 0) =>
  (await view(outingId)).teeTimes[tee]!.slots.find((s) => s.open)!;
const time = async (outingId: string, startsAt: string) =>
  formatTime(startsAt, (await view(outingId)).timezone);

/** Full phone-code claim; returns the result. */
async function claimByPhone(outingId: string, slotId: string, name: string, phone: string, guests = 0) {
  const { demoCode } = await startClaim(deps, outingId, { slotId, name, phone, guests }, ctx);
  return confirmClaim(deps, outingId, { slotId, name, phone, guests, code: demoCode }, ctx);
}

describe('claiming with a phone code', () => {
  it('texts (shows) a code, then seats the player', async () => {
    const id = await makeOuting(t, mike.id);
    const slot = await openSlot(id);
    const started = await startClaim(
      deps,
      id,
      { slotId: slot.id, name: 'Chris', phone: '(410) 555-0199' },
      ctx,
    );
    expect(started.phoneMasked).toBe('•••-•••-0199');
    expect(started.demoCode).toMatch(/^\d{6}$/);

    await expect(
      confirmClaim(
        deps,
        id,
        {
          slotId: slot.id,
          name: 'Chris',
          phone: '4105550199',
          code: '000000' === started.demoCode ? '111111' : '000000',
        },
        ctx,
      ),
    ).rejects.toMatchObject({ code: 'invalid_input' });

    const result = await confirmClaim(
      deps,
      id,
      { slotId: slot.id, name: 'Chris', phone: '410-555-0199', code: started.demoCode },
      ctx,
    );
    expect(await time(id, result.startsAt)).toBe('7:40 AM');
    const v = await view(id, result.playerId);
    expect(v.teeTimes[0]!.slots.find((s) => s.id === slot.id)).toMatchObject({ isYou: true, name: 'Chris' });
    const [p] = await withTenant(t.db, t.tenantId, (tx) =>
      tx.select().from(players).where(eq(players.id, result.playerId)),
    );
    expect(p).toMatchObject({ phoneE164: '+14105550199' });
    expect(p!.phoneVerifiedAt).not.toBeNull();
  });

  it('rejects bad phone numbers before sending anything', async () => {
    const id = await makeOuting(t, mike.id);
    const slot = await openSlot(id);
    await expect(
      startClaim(deps, id, { slotId: slot.id, name: 'Chris', phone: '555-0199' }, ctx),
    ).rejects.toMatchObject({
      code: 'invalid_input',
      details: { fields: { phone: 'Enter a 10-digit mobile number.' } },
    });
  });

  it('a code dies after 5 wrong tries', async () => {
    const id = await makeOuting(t, mike.id);
    const slot = await openSlot(id);
    const phone = '4105550111';
    const { demoCode } = await startClaim(deps, id, { slotId: slot.id, name: 'Sam', phone }, ctx);
    const wrong = demoCode === '123456' ? '654321' : '123456';
    for (let i = 0; i < 4; i++) {
      await expect(
        confirmClaim(deps, id, { slotId: slot.id, name: 'Sam', phone, code: wrong }, ctx),
      ).rejects.toMatchObject({
        code: 'invalid_input',
      });
    }
    await expect(
      confirmClaim(deps, id, { slotId: slot.id, name: 'Sam', phone, code: wrong }, ctx),
    ).rejects.toMatchObject({
      code: 'gone',
    });
    await expect(
      confirmClaim(deps, id, { slotId: slot.id, name: 'Sam', phone, code: demoCode }, ctx),
    ).rejects.toMatchObject({
      code: 'gone',
    });
  });

  it('limits how many codes one phone can request', async () => {
    const id = await makeOuting(t, mike.id);
    const slot = await openSlot(id);
    for (let i = 0; i < 5; i++)
      await startClaim(deps, id, { slotId: slot.id, name: 'Lee', phone: '4105550122' }, ctx);
    await expect(
      startClaim(deps, id, { slotId: slot.id, name: 'Lee', phone: '4105550122' }, ctx),
    ).rejects.toMatchObject({
      code: 'rate_limited',
    });
  });

  it('seats guests in the same tee time first, then the next ones', async () => {
    const id = await makeOuting(t, mike.id, { teeTimeCount: 2, playersEach: 3 });
    // 7:40 has Mike + 2 open; Jen takes one of them and brings 2 guests.
    const slot = await openSlot(id, 0);
    const r = await claimByPhone(id, slot.id, 'Jen Putts', '4105550133', 2);
    expect(r.guestCount).toBe(2);
    const v = await view(id, r.playerId);
    const names = v.teeTimes.map((tt) => tt.slots.map((s) => s.name));
    expect(names[0]).toEqual(['Mike Golfer', 'Jen Putts', "Jen Putts's guest"]);
    expect(names[1]).toEqual(["Jen Putts's guest", null, null]);
  });

  it('refuses more guests than open spots', async () => {
    const id = await makeOuting(t, mike.id, { teeTimeCount: 1, playersEach: 2 });
    const slot = await openSlot(id);
    await expect(
      startClaim(deps, id, { slotId: slot.id, name: 'Jen', phone: '4105550144', guests: 1 }, ctx),
    ).rejects.toMatchObject({ code: 'conflict', details: { reason: 'no_room' } });
  });

  it('logs a slot_claimed event with what the banner needs', async () => {
    const id = await makeOuting(t, mike.id);
    const slot = await openSlot(id, 1);
    await claimByPhone(id, slot.id, 'Tony Fairway', '4105550155', 1);
    const [e] = await withTenant(t.db, t.tenantId, (tx) =>
      tx.select().from(outingEvents).where(eq(outingEvents.outingId, id)).orderBy(outingEvents.id).offset(1),
    );
    expect(e?.type).toBe('slot_claimed');
    expect(e?.payload).toMatchObject({ playerName: 'Tony Fairway', guestCount: 1 });
  });
});

describe('claim races and rules', () => {
  it('two people grabbing the same spot: exactly one wins, the other gets slot_taken', async () => {
    const id = await makeOuting(t, mike.id);
    const slot = await openSlot(id);
    const a = await makePlayer(t, 'Racer A');
    const b = await makePlayer(t, 'Racer B');
    const results = await Promise.allSettled([
      claimAsPlayer(deps, id, a.id, { slotId: slot.id }),
      claimAsPlayer(deps, id, b.id, { slotId: slot.id }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const lost = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(lost.reason).toMatchObject({ code: 'conflict', details: { reason: 'slot_taken' } });
  });

  it('one personal spot per player per outing', async () => {
    const id = await makeOuting(t, mike.id);
    const p = await makePlayer(t, 'Greedy Gus');
    await claimAsPlayer(deps, id, p.id, { slotId: (await openSlot(id, 0)).id });
    await expect(claimAsPlayer(deps, id, p.id, { slotId: (await openSlot(id, 1)).id })).rejects.toMatchObject(
      {
        code: 'conflict',
        details: { reason: 'already_in' },
      },
    );
  });

  it('no claims or drop-outs while locked', async () => {
    const id = await makeOuting(t, mike.id);
    const p = await makePlayer(t, 'Late Larry');
    const q = await makePlayer(t, 'Quitter Quinn');
    await claimAsPlayer(deps, id, q.id, { slotId: (await openSlot(id)).id });
    await setLocked(deps, { playerId: mike.id }, id, true);
    await expect(claimAsPlayer(deps, id, p.id, { slotId: (await openSlot(id)).id })).rejects.toMatchObject({
      code: 'conflict',
      details: { reason: 'locked' },
    });
    await expect(dropOut(deps, id, q.id)).rejects.toMatchObject({ code: 'conflict' });
  });

  it('dropping out frees your spot and your guests’ spots', async () => {
    const id = await makeOuting(t, mike.id);
    const p = await makePlayer(t, 'Dave Drop');
    await claimAsPlayer(deps, id, p.id, { slotId: (await openSlot(id, 1)).id, guests: 2 });
    expect((await view(id)).openCount).toBe(8);
    await dropOut(deps, id, p.id);
    expect((await view(id)).openCount).toBe(11);
    await expect(dropOut(deps, id, p.id)).rejects.toMatchObject({ code: 'conflict' });
    await expect(dropOut(deps, id, mike.id)).rejects.toMatchObject({ code: 'conflict' });
  });
});

describe('invite links', () => {
  it('returns the same link until it is rotated', async () => {
    const id = await makeOuting(t, mike.id);
    const a = await ensureInviteLink(inviteDeps, { playerId: mike.id }, id);
    const b = await ensureInviteLink(inviteDeps, { playerId: mike.id }, id);
    expect(a.token).toBe(b.token);
    expect(a.token).toMatch(/^[0-9A-Za-z]{22}$/);
    expect(await resolveInviteToken(inviteDeps, a.token)).toBe(id);

    const c = await rotateInviteLink(inviteDeps, { playerId: mike.id }, id);
    expect(c.token).not.toBe(a.token);
    expect(await resolveInviteToken(inviteDeps, a.token)).toBeNull();
    expect(await resolveInviteToken(inviteDeps, c.token)).toBe(id);
  });

  it('honors expiry and revoke, and rejects junk tokens', async () => {
    const id = await makeOuting(t, mike.id);
    const soon = await createInviteLink(inviteDeps, { playerId: mike.id }, id, new Date(Date.now() + 60_000));
    expect(await resolveInviteToken(inviteDeps, soon.token)).toBe(id);
    const later = { ...inviteDeps, now: () => new Date(Date.now() + 120_000) };
    expect(await resolveInviteToken(later, soon.token)).toBeNull();

    await revokeInviteLink(inviteDeps, { playerId: mike.id }, soon.id);
    expect(await resolveInviteToken(inviteDeps, soon.token)).toBeNull();
    expect(await resolveInviteToken(inviteDeps, "'; drop table outings; --")).toBeNull();
  });

  it('only the organizer can make links', async () => {
    const id = await makeOuting(t, mike.id);
    const p = await makePlayer(t, 'Not Mike');
    await expect(ensureInviteLink(inviteDeps, { playerId: p.id }, id)).rejects.toMatchObject({
      code: 'forbidden',
    });
  });
});
