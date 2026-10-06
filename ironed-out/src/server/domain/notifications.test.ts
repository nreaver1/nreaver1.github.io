import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import { makeOuting, makePlayer } from '../../../tests/helpers/fixtures';
import { notifications, outingEvents, players } from '../db/schema';
import { withTenant } from '../db/tenant';
import { OutboxMailer } from '../notify/email';
import { inQuietHours, nextSendTime, zonedTime } from '../notify/quiet';
import { DemoSms, validTwilioSignature } from '../notify/sms';
import { claimAsPlayer, dropOut } from './claims';
import {
  enqueueForEvent,
  getAlertSettings,
  handleInboundSms,
  runDispatch,
  setAlertPref,
  setQuietHours,
  type DispatchDeps,
} from './notifications';
import { deleteOuting, getOutingView, removePlayer, type OutingsDeps } from './outings';

let t: TestDb;
let deps: OutingsDeps;
let sms: DemoSms;
let mail: OutboxMailer;
const SECRET = 'notify-test-secret-0123456789-0123456789';
const later = (minutes: number) => new Date(Date.now() + minutes * 60_000);

const dispatchDeps = (now: Date): DispatchDeps => ({
  db: t.db,
  sms,
  mailer: mail,
  secret: SECRET,
  appUrl: 'https://ironed.test',
  now: () => now,
});

/** A player with a verified phone (and quiet hours off unless asked, so tests don't depend on the clock). */
async function texter(name: string, phone: string, quiet = false) {
  const p = await makePlayer(t, name, phone);
  await withTenant(t.db, t.tenantId, (tx) =>
    tx.update(players).set({ phoneVerifiedAt: new Date() }).where(eq(players.id, p.id)),
  );
  if (!quiet) await setQuietHours(deps, p.id, false);
  return p;
}

const pending = (playerId: string) =>
  withTenant(t.db, t.tenantId, (tx) =>
    tx.select().from(notifications).where(eq(notifications.playerId, playerId)),
  );
const firstOpen = async (id: string, tee = 0) =>
  (await getOutingView(deps, id, null))!.teeTimes[tee]!.slots.find((s) => s.open)!.id;

beforeAll(async () => {
  t = await createTestDb();
  deps = { db: t.db, tenantId: t.tenantId };
});
afterAll(async () => {
  await t.pg.close();
});
beforeEach(() => {
  sms = new DemoSms();
  mail = new OutboxMailer();
});

describe('fan-out and coalescing', () => {
  it('a burst of changes becomes one text, worded like the design', async () => {
    const mike = await texter('Mike Golfer', '+14105550201');
    const dave = await texter('Dave Divot', '+14105550202');
    const chris = await texter('Chris Chipper', '+14105550203');
    const id = await makeOuting(t, mike.id);

    await claimAsPlayer(deps, id, dave.id, { slotId: await firstOpen(id, 1) });
    await claimAsPlayer(deps, id, chris.id, { slotId: await firstOpen(id, 1), guests: 1 });
    await dropOut(deps, id, dave.id);

    const rows = (await pending(mike.id)).filter((n) => n.channel === 'sms');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.eventIds).toHaveLength(3);
    // Coalescing window: nothing goes out right away.
    expect(await runDispatch(dispatchDeps(new Date()))).toMatchObject({ sent: 0 });

    await runDispatch(dispatchDeps(later(3)));
    const text = sms.sent.find((m) => m.to === '+14105550201')!.body;
    expect(text).toMatch(/^Ironed Out: Mount Pleasant, \w{3}, \w{3} \d+: /);
    expect(text).toContain('Chris Chipper grabbed 7:50 AM and is bringing a guest.');
    expect(text).toContain('Dave Divot dropped out. A spot opened at 7:50 AM.');
    expect(text).toMatch(/https:\/\/ironed\.test\/outings\/[0-9a-f-]{36}$/);

    // Dave gets nothing about his own moves, only Chris's claim (counts are as of sending).
    const daveText = sms.sent.find((m) => m.to === '+14105550202')!.body;
    expect(daveText).toMatch(
      /^Ironed Out: Chris grabbed the 7:50 AM spot \(\+1 guest\)\. \w+ is now 3 of 12\./,
    );
  });

  it('a single drop-out uses the design wording', async () => {
    const mike = await texter('Mike Golfer', '+14105550211');
    const dave = await makePlayer(t, 'Dave Divot');
    const id = await makeOuting(t, mike.id);
    await claimAsPlayer(deps, id, dave.id, { slotId: await firstOpen(id, 1) });
    await runDispatch(dispatchDeps(later(3)));
    sms.sent.length = 0;
    await dropOut(deps, id, dave.id);
    await runDispatch(dispatchDeps(later(3)));
    expect(sms.sent[0]?.body).toMatch(
      /^Ironed Out: Dave dropped out of Sat 7:50 AM at Mount Pleasant\. 11 spots open\. Grab it: /,
    );
  });

  it('respects per-type preferences and SMS opt-out (STOP / START)', async () => {
    const mike = await texter('Mike Golfer', '+14105550221');
    const jen = await makePlayer(t, 'Jen Putts');
    await setAlertPref(deps, mike.id, { type: 'join', channel: 'sms', on: false });
    expect((await getAlertSettings(deps, mike.id)).prefs.join).toEqual({ sms: false, email: false });

    const id = await makeOuting(t, mike.id);
    await claimAsPlayer(deps, id, jen.id, { slotId: await firstOpen(id) });
    expect(await pending(mike.id)).toHaveLength(0);

    expect(await handleInboundSms(t.db, '+14105550221', 'stop')).toMatchObject({ action: 'stop' });
    expect((await getAlertSettings(deps, mike.id)).smsOptedOut).toBe(true);
    await dropOut(deps, id, jen.id);
    expect(await pending(mike.id)).toHaveLength(0);

    await handleInboundSms(t.db, '+14105550221', 'START');
    expect((await getAlertSettings(deps, mike.id)).smsOptedOut).toBe(false);
    expect((await handleInboundSms(t.db, '+14105550221', 'help')).reply).toContain('Reply STOP');
  });

  it('a removed player is told, even with alerts off', async () => {
    const mike = await texter('Mike Golfer', '+14105550231');
    const sam = await texter('Sam Bunker', '+14105550232');
    await setAlertPref(deps, sam.id, { type: 'drop', channel: 'sms', on: false });
    const id = await makeOuting(t, mike.id);
    const slot = await firstOpen(id);
    await claimAsPlayer(deps, id, sam.id, { slotId: slot });
    await removePlayer(deps, { playerId: mike.id }, slot);
    await runDispatch(dispatchDeps(later(1)));
    expect(sms.sent.find((m) => m.to === '+14105550232')?.body).toMatch(
      /^Ironed Out: Mike took you off the \w{3}, \w{3} \d+ outing at Mount Pleasant\./,
    );
  });
});

describe('outing canceled', () => {
  it('tells players holding a spot by text or email, per their settings, after the outing is gone', async () => {
    const mike = await texter('Mike Golfer', '+14105550271');
    const sam = await texter('Sam Bunker', '+14105550272');
    const jen = await texter('Jen Putts', '+14105550273');
    await setAlertPref(deps, jen.id, { type: 'canceled', channel: 'sms', on: false });
    const tony = await makePlayer(t, 'Tony Fairway');
    const email = `tony-${Date.now()}@example.com`;
    await withTenant(t.db, t.tenantId, async (tx) => {
      const { users } = await import('../db/schema');
      const [u] = await tx
        .insert(users)
        .values({ tenantId: t.tenantId, email, name: 'Tony Fairway', passwordHash: 'x' })
        .returning();
      await tx.update(players).set({ userId: u!.id }).where(eq(players.id, tony.id));
    });
    const id = await makeOuting(t, mike.id);
    for (const p of [sam, jen, tony]) await claimAsPlayer(deps, id, p.id, { slotId: await firstOpen(id) });

    await deleteOuting(deps, { playerId: mike.id }, id);
    await runDispatch(dispatchDeps(later(1)));

    expect(sms.sent.find((m) => m.to === '+14105550272')?.body).toMatch(
      /^Ironed Out: Mike canceled the \w{3}, \w{3} \d+ outing at Mount Pleasant \(7:40 AM\)\./,
    );
    expect(sms.sent.find((m) => m.to === '+14105550273')).toBeUndefined();
    expect(sms.sent.find((m) => m.to === '+14105550271')).toBeUndefined();
    const sent = mail.messages.find((m) => m.to === email);
    expect(sent?.subject).toMatch(/^Canceled: the .* outing at Mount Pleasant Golf Course$/);
    expect(sent?.text).toMatch(/^Mike canceled the/);
    expect((await pending(sam.id)).find((n) => n.kind === 'canceled')?.status).toBe('sent');
  });
});

describe('quiet hours', () => {
  it('knows the window, including across midnight', () => {
    const tz = 'America/New_York';
    expect(inQuietHours(new Date('2026-10-10T03:30:00Z'), tz, '22:00', '07:00')).toBe(true); // 11:30 PM
    expect(inQuietHours(new Date('2026-10-10T16:00:00Z'), tz, '22:00', '07:00')).toBe(false); // noon
    expect(
      nextSendTime(new Date('2026-10-10T03:30:00Z'), tz, { start: '22:00', end: '07:00' }).toISOString(),
    ).toBe('2026-10-10T11:00:00.000Z');
    expect(zonedTime('2026-10-09', 18 * 60, tz).toISOString()).toBe('2026-10-09T22:00:00.000Z');
    expect(zonedTime('2026-12-09', 18 * 60, tz).toISOString()).toBe('2026-12-09T23:00:00.000Z');
  });

  it('holds a late-night text until 7 AM', async () => {
    const mike = await texter('Mike Golfer', '+14105550241', true);
    const jen = await makePlayer(t, 'Jen Putts');
    const id = await makeOuting(t, mike.id);
    const slot = await firstOpen(id);
    const elevenPm = new Date('2026-10-10T03:00:00Z');
    await withTenant(t.db, t.tenantId, async (tx) => {
      await tx
        .update((await import('../db/schema')).slots)
        .set({ playerId: jen.id })
        .where(eq((await import('../db/schema')).slots.id, slot));
      const [e] = await tx
        .insert(outingEvents)
        .values({
          outingId: id,
          type: 'slot_claimed',
          actorPlayerId: jen.id,
          payload: { playerName: 'Jen Putts', startsAt: new Date().toISOString() },
        })
        .returning();
      await enqueueForEvent(
        tx,
        { id: Number(e!.id), outingId: id, type: 'slot_claimed', actorPlayerId: jen.id, payload: e!.payload },
        elevenPm,
      );
    });
    const [row] = await pending(mike.id);
    expect(row!.sendAfter.toISOString()).toBe('2026-10-10T11:00:00.000Z');
  });
});

describe('reminders', () => {
  it('schedules a day-before email and a 2-hour text, once each', async () => {
    const mike = await texter('Mike Golfer', '+14105550251');
    await withTenant(t.db, t.tenantId, async (tx) => {
      const { users } = await import('../db/schema');
      const [u] = await tx
        .insert(users)
        .values({
          tenantId: t.tenantId,
          email: `mike-${Date.now()}@example.com`,
          name: 'Mike Golfer',
          passwordHash: 'x',
        })
        .returning();
      await tx.update(players).set({ userId: u!.id }).where(eq(players.id, mike.id));
    });
    const tony = await makePlayer(t, 'Tony Fairway');
    const id = await makeOuting(t, mike.id);
    await claimAsPlayer(deps, id, tony.id, { slotId: await firstOpen(id) });
    const view = (await getOutingView(deps, id, mike.id))!;
    const first = new Date(view.teeTimes[0]!.startsAt);

    // The evening before: the day-before email goes out.
    const eveningBefore = zonedTime(
      new Date(new Date(`${view.playDate}T12:00:00Z`).getTime() - 86_400_000).toISOString().slice(0, 10),
      18 * 60 + 5,
      view.timezone,
    );
    await runDispatch(dispatchDeps(eveningBefore));
    const mine = (await pending(mike.id)).filter((n) => n.kind.startsWith('remind'));
    expect(mine.map((n) => `${n.kind}:${n.channel}`).sort()).toEqual(['remind_2h:sms', 'remind_day:email']);
    expect(
      mail.messages.find((m) => m.subject.startsWith('Tomorrow: 7:40 AM at Mount Pleasant')),
    ).toBeDefined();
    await runDispatch(dispatchDeps(eveningBefore));
    expect((await pending(mike.id)).filter((n) => n.kind.startsWith('remind'))).toHaveLength(2);

    // Two hours before tee off: the text, naming who they're playing with.
    const twoHours = new Date(first.getTime() - 2 * 3_600_000 + 60_000);
    await runDispatch(dispatchDeps(twoHours));
    expect(sms.sent.find((m) => m.to === '+14105550251' && m.body.includes('Tee off'))?.body).toMatch(
      /^Ironed Out: Tee off at 7:40 AM, Mount Pleasant \(6001 Hillen Rd\)\. You're with Tony\. Hit 'em straight\./,
    );
  });
});

describe('delivery failures', () => {
  it('retries with backoff, then gives up', async () => {
    const mike = await texter('Mike Golfer', '+14105550261');
    const jen = await makePlayer(t, 'Jen Putts');
    const id = await makeOuting(t, mike.id);
    await claimAsPlayer(deps, id, jen.id, { slotId: await firstOpen(id) });
    const broken = {
      ...dispatchDeps(later(3)),
      sms: { kind: 'demo' as const, send: async () => Promise.reject(new Error('boom')) },
    };
    expect(await runDispatch(broken)).toMatchObject({ retry: 1 });
    const [row] = await pending(mike.id);
    expect(row).toMatchObject({ status: 'pending', attempts: 1, lastError: 'boom' });
    for (let i = 0; i < 4; i++) await runDispatch({ ...broken, now: () => later(3 + 60 * (i + 1)) });
    expect((await pending(mike.id))[0]).toMatchObject({ status: 'failed', attempts: 5 });
  });
});

describe('twilio webhook signature', () => {
  it('matches the documented algorithm', () => {
    // Example from Twilio's docs (https://www.twilio.com/docs/usage/security).
    const params = {
      CallSid: 'CA1234567890ABCDE',
      Caller: '+12349013030',
      Digits: '1234',
      From: '+12349013030',
      To: '+18005551212',
    };
    const url = 'https://mycompany.com/myapp.php?foo=1&bar=2';
    expect(validTwilioSignature('12345', url, params, '0/KCTR6DLpKmkAf8muzZqo1nDgQ=')).toBe(true);
    expect(validTwilioSignature('12345', url, params, 'nope')).toBe(false);
  });
});
