import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import { courseId, futureSaturday } from '../../../tests/helpers/fixtures';
import { players, users } from '../db/schema';
import { withTenant } from '../db/tenant';
import { OutboxMailer } from '../notify/email';
import { DemoSms } from '../notify/sms';
import {
  acceptCrewInvite,
  cancelCrewInvite,
  createCrew,
  declineCrewInvite,
  deliverCrewInvite,
  getCrew,
  inviteToCrew,
  invitesForUser,
  joinCrew,
  leaveCrew,
  listCrews,
  removeCrewMember,
  resolveCrewToken,
  rotateCrewInvite,
  type CrewDeps,
} from './crews';
import { ensureInviteLink } from './invites';
import { handleInboundSms, runDispatch, setQuietHours } from './notifications';
import { createOuting } from './outings';

let t: TestDb;
let deps: CrewDeps;
const SECRET = 'crew-test-secret-0123456789-0123456789';

/** An account holder with their player (and optionally a verified phone). */
async function account(name: string, phone: string | null = null) {
  return withTenant(t.db, t.tenantId, async (tx) => {
    const [u] = await tx
      .insert(users)
      .values({
        tenantId: t.tenantId,
        email: `${name.split(' ')[0]!.toLowerCase()}-${Date.now()}-${Math.random()}@example.com`,
        name,
        passwordHash: 'x',
        phoneE164: phone,
        phoneVerifiedAt: phone ? new Date() : null,
      })
      .returning();
    const [p] = await tx
      .insert(players)
      .values({ tenantId: t.tenantId, userId: u!.id, displayName: name })
      .returning();
    return { userId: u!.id, playerId: p!.id };
  });
}

beforeAll(async () => {
  t = await createTestDb();
  deps = { db: t.db, tenantId: t.tenantId, secret: SECRET };
});
afterAll(async () => {
  await t.pg.close();
});

describe('crews', () => {
  it('create, share the link, join, and see each other', async () => {
    const mike = await account('Mike Golfer');
    const jen = await account('Jen Putts');
    const crewId = await createCrew(deps, mike.userId, { name: '  Saturday Hackers ' });

    const view = (await getCrew(deps, mike.userId, crewId))!;
    expect(view).toMatchObject({ name: 'Saturday Hackers', isOwner: true });
    expect(view.inviteToken).toMatch(/^[0-9A-Za-z]{22}$/);
    expect((await getCrew(deps, mike.userId, crewId))!.inviteToken).toBe(view.inviteToken);

    // Outsiders can't see the crew, but the link previews it.
    expect(await getCrew(deps, jen.userId, crewId)).toBeNull();
    expect(await resolveCrewToken(deps, view.inviteToken)).toMatchObject({
      name: 'Saturday Hackers',
      memberCount: 1,
      ownerName: 'Mike Golfer',
    });

    expect(await joinCrew(deps, jen.userId, view.inviteToken)).toBe(crewId);
    await joinCrew(deps, jen.userId, view.inviteToken); // idempotent
    const seen = (await getCrew(deps, jen.userId, crewId))!;
    expect(seen.isOwner).toBe(false);
    expect(seen.members.map((m) => `${m.name}:${m.role}`)).toEqual(['Mike Golfer:owner', 'Jen Putts:member']);
    expect(await listCrews(deps, jen.userId)).toEqual([
      { id: crewId, name: 'Saturday Hackers', memberCount: 2, pendingCount: 0, isOwner: false },
    ]);
  });

  it('owners rotate the link and remove members; members leave', async () => {
    const mike = await account('Mike Golfer');
    const sam = await account('Sam Bunker');
    const dee = await account('Dee Long');
    const crewId = await createCrew(deps, mike.userId, { name: 'Sunday Shankers' });
    const old = (await getCrew(deps, mike.userId, crewId))!.inviteToken;
    await joinCrew(deps, sam.userId, old);
    await joinCrew(deps, dee.userId, old);

    await expect(rotateCrewInvite(deps, sam.userId, crewId)).rejects.toMatchObject({ code: 'forbidden' });
    await rotateCrewInvite(deps, mike.userId, crewId);
    expect(await resolveCrewToken(deps, old)).toBeNull();

    await removeCrewMember(deps, mike.userId, crewId, sam.userId);
    expect(await getCrew(deps, sam.userId, crewId)).toBeNull();
    await leaveCrew(deps, dee.userId, crewId);
    expect((await getCrew(deps, mike.userId, crewId))!.members).toHaveLength(1);

    // An owner alone can leave, which deletes the crew.
    await leaveCrew(deps, mike.userId, crewId);
    expect(await listCrews(deps, mike.userId)).toEqual([]);
  });

  it('validates names and rejects junk tokens', async () => {
    const mike = await account('Mike Golfer');
    await expect(createCrew(deps, mike.userId, { name: '   ' })).rejects.toMatchObject({
      code: 'invalid_input',
    });
    expect(await resolveCrewToken(deps, 'nope')).toBeNull();
    await expect(joinCrew(deps, mike.userId, 'abcdefghijklmnopqrstuv')).rejects.toMatchObject({
      code: 'gone',
    });
  });
});

describe('starting an outing with a crew', () => {
  it('texts the other members with the invite link, and only crew members can use the crew', async () => {
    const mike = await account('Mike Golfer', '+14105550301');
    const jen = await account('Jen Putts', '+14105550302');
    const tony = await account('Tony Fairway'); // no phone: gets an email
    const outsider = await account('Out Sider');
    await setQuietHours(deps, jen.playerId, false);
    const crewId = await createCrew(deps, mike.userId, { name: 'Saturday Hackers' });
    const token = (await getCrew(deps, mike.userId, crewId))!.inviteToken;
    await joinCrew(deps, jen.userId, token);
    await joinCrew(deps, tony.userId, token);

    const base = {
      courseId: await courseId(t),
      playDate: futureSaturday(),
      firstTeeMinutes: 460,
      teeTimeCount: 3,
      playersEach: 4,
      intervalMinutes: 10,
      price: '45',
    };
    await expect(
      createOuting(deps, { playerId: outsider.playerId }, { ...base, crewId }),
    ).rejects.toMatchObject({ code: 'invalid_input' });

    const outingId = await createOuting(deps, { playerId: mike.playerId }, { ...base, crewId });
    const link = await ensureInviteLink(deps, { playerId: mike.playerId }, outingId);

    const sms = new DemoSms();
    const mail = new OutboxMailer();
    await runDispatch({
      db: t.db,
      sms,
      mailer: mail,
      secret: SECRET,
      appUrl: 'https://ironed.test',
      now: () => new Date(Date.now() + 1000),
    });
    expect(sms.sent.map((m) => m.to)).toEqual(['+14105550302']);
    expect(sms.sent[0]!.body).toBe(
      `Ironed Out: Mike started an outing at Mount Pleasant, ${new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${base.playDate}T12:00:00Z`))} · 7:40, 7:50 & 8:00 AM. 11 spots open. Grab one: https://ironed.test/t/${link.token}`,
    );
    expect(mail.messages.map((m) => m.subject)).toEqual([
      expect.stringMatching(/^Mike started an outing: Mount Pleasant Golf Course, /),
    ]);
    const [saved] = await withTenant(t.db, t.tenantId, async (tx) => {
      const { outings } = await import('../db/schema');
      return tx.select({ crewId: outings.crewId }).from(outings).where(eq(outings.id, outingId));
    });
    expect(saved?.crewId).toBe(crewId);
  });
});

describe('personal invites ("invited" members)', () => {
  const services = () => ({
    ...deps,
    sms: new DemoSms(),
    mailer: new OutboxMailer(),
    appUrl: 'https://ironed.test',
  });

  it('invites by phone or email, shows them as invited, and delivers a personal link', async () => {
    const mike = await account('Mike Golfer');
    const crewId = await createCrew(deps, mike.userId, { name: 'Saturday Hackers' });
    const s = services();

    const byPhone = await inviteToCrew(deps, mike.userId, crewId, {
      name: 'Alex Ace',
      contact: '(410) 555-0401',
    });
    expect(await deliverCrewInvite(s, byPhone)).toBe('sms');
    expect(s.sms.sent[0]).toEqual({
      to: '+14105550401',
      body: `Ironed Out: Mike invited you to Saturday Hackers, their golf crew. Join to hear about tee times: https://ironed.test/g/${byPhone.token} Reply STOP to opt out.`,
    });

    const byEmail = await inviteToCrew(deps, mike.userId, crewId, {
      name: 'Rob Rough',
      contact: 'ROB@example.com',
    });
    expect(await deliverCrewInvite(s, byEmail)).toBe('email');
    expect(s.mailer.messages[0]).toMatchObject({
      to: 'rob@example.com',
      subject: 'Mike invited you to Saturday Hackers on Ironed Out',
    });

    const view = (await getCrew(deps, mike.userId, crewId))!;
    expect(view.invited.map((i) => `${i.name}:${i.contact}`)).toEqual([
      'Alex Ace:•••-•••-0401',
      'Rob Rough:rob@example.com',
    ]);
    expect((await listCrews(deps, mike.userId))[0]).toMatchObject({ memberCount: 1, pendingCount: 2 });

    // Re-inviting the same number refreshes the invite instead of adding another.
    const again = await inviteToCrew(deps, mike.userId, crewId, { name: 'Alex A.', contact: '4105550401' });
    expect(again.inviteId).toBe(byPhone.inviteId);
    expect((await getCrew(deps, mike.userId, crewId))!.invited).toHaveLength(2);

    await expect(
      inviteToCrew(deps, mike.userId, crewId, { name: 'Nobody', contact: 'not a contact' }),
    ).rejects.toMatchObject({ code: 'invalid_input' });
  });

  it('only the owner invites, and members don’t see contact details', async () => {
    const mike = await account('Mike Golfer');
    const jen = await account('Jen Putts');
    const crewId = await createCrew(deps, mike.userId, { name: 'Crew' });
    await joinCrew(deps, jen.userId, (await getCrew(deps, mike.userId, crewId))!.inviteToken);
    await inviteToCrew(deps, mike.userId, crewId, { name: 'Alex Ace', contact: 'alex@example.com' });
    await expect(
      inviteToCrew(deps, jen.userId, crewId, { name: 'Sam', contact: 'sam@example.com' }),
    ).rejects.toMatchObject({ code: 'forbidden' });
    expect((await getCrew(deps, jen.userId, crewId))!.invited).toEqual([
      { inviteId: expect.any(String), name: 'Alex Ace', contact: null, token: null },
    ]);
  });

  it('someone with a matching account accepts from Home; declining hides it', async () => {
    const mike = await account('Mike Golfer');
    const crewId = await createCrew(deps, mike.userId, { name: 'Saturday Hackers' });
    const tony = await account('Tony Fairway', '+14105550402');
    const dee = await account('Dee Long');
    const deeEmail = await withTenant(t.db, t.tenantId, async (tx) => {
      const [u] = await tx.select({ email: users.email }).from(users).where(eq(users.id, dee.userId));
      return u!.email;
    });
    await inviteToCrew(deps, mike.userId, crewId, { name: 'Tony', contact: '410-555-0402' });
    await inviteToCrew(deps, mike.userId, crewId, { name: 'Dee', contact: deeEmail });

    const forTony = await invitesForUser(deps, tony.userId);
    expect(forTony).toEqual([
      { inviteId: expect.any(String), crewId, crewName: 'Saturday Hackers', fromName: 'Mike Golfer' },
    ]);
    await acceptCrewInvite(deps, tony.userId, forTony[0]!.inviteId);
    expect(await invitesForUser(deps, tony.userId)).toEqual([]);
    expect((await getCrew(deps, tony.userId, crewId))!.members.map((m) => m.name)).toContain('Tony Fairway');

    const forDee = await invitesForUser(deps, dee.userId);
    await declineCrewInvite(deps, dee.userId, forDee[0]!.inviteId);
    expect(await invitesForUser(deps, dee.userId)).toEqual([]);
    expect((await getCrew(deps, mike.userId, crewId))!.invited).toEqual([]);

    // Someone else can't accept an invite that wasn't for them.
    const sam = await account('Sam Bunker');
    const inv = await inviteToCrew(deps, mike.userId, crewId, { name: 'Pat', contact: 'pat@example.com' });
    await expect(acceptCrewInvite(deps, sam.userId, inv.inviteId)).rejects.toMatchObject({ code: 'gone' });
  });

  it('a personal link works once, the owner can cancel it, and STOP blocks invite texts', async () => {
    const mike = await account('Mike Golfer');
    const crewId = await createCrew(deps, mike.userId, { name: 'Saturday Hackers' });
    const inv = await inviteToCrew(deps, mike.userId, crewId, {
      name: 'Alex Ace',
      contact: 'alex2@example.com',
    });
    expect(await resolveCrewToken(deps, inv.token)).toMatchObject({
      name: 'Saturday Hackers',
      inviteeName: 'Alex Ace',
    });

    const alex = await account('Alex Ace');
    await joinCrew(deps, alex.userId, inv.token);
    expect(await resolveCrewToken(deps, inv.token)).toBeNull();
    expect((await getCrew(deps, mike.userId, crewId))!.invited).toEqual([]);

    const other = await inviteToCrew(deps, mike.userId, crewId, { name: 'Rob', contact: '4105550403' });
    await cancelCrewInvite(deps, mike.userId, other.inviteId);
    expect(await resolveCrewToken(deps, other.token)).toBeNull();

    // A number that replied STOP doesn't get invite texts.
    const stopper = await withTenant(t.db, t.tenantId, async (tx) => {
      const [p] = await tx
        .insert(players)
        .values({ tenantId: t.tenantId, displayName: 'Stop Stu', phoneE164: '+14105550404' })
        .returning();
      return p!;
    });
    await handleInboundSms(t.db, '+14105550404', 'STOP');
    const s = services();
    const toStopper = await inviteToCrew(deps, mike.userId, crewId, { name: 'Stu', contact: '4105550404' });
    expect(await deliverCrewInvite(s, toStopper)).toBe('skipped');
    expect(s.sms.sent).toEqual([]);
    expect(stopper.displayName).toBe('Stop Stu');
  });
});
