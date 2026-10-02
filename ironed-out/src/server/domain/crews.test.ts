import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import { courseId, futureSaturday } from '../../../tests/helpers/fixtures';
import { players, users } from '../db/schema';
import { withTenant } from '../db/tenant';
import { OutboxMailer } from '../notify/email';
import { DemoSms } from '../notify/sms';
import {
  createCrew,
  getCrew,
  joinCrew,
  leaveCrew,
  listCrews,
  removeCrewMember,
  resolveCrewToken,
  rotateCrewInvite,
  type CrewDeps,
} from './crews';
import { ensureInviteLink } from './invites';
import { runDispatch, setQuietHours } from './notifications';
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
