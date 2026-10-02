import { and, asc, eq, gte, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  courses,
  inviteLinks,
  notificationPrefs,
  notifications,
  notificationSettings,
  outingEvents,
  outings,
  players,
  slots,
  teeTimes,
  tenants,
  users,
} from '../db/schema';
import { withTenant } from '../db/tenant';
import type { Db, Tx } from '../db/types';
import { DomainError } from '../errors';
import type { Mailer } from '../notify/email';
import { DEFAULT_QUIET, nextSendTime, zonedTime } from '../notify/quiet';
import { HELP_WORDS, START_WORDS, STOP_WORDS, type SmsSender } from '../notify/sms';
import { derivedToken } from '../security/tokens';
import { describeEvent } from './feed';
import { loadOutingView, type OutingView } from './outings';

export type AlertType = 'join' | 'drop' | 'change' | 'remind_day' | 'remind_2h';
export type Channel = 'sms' | 'email';
export const ALERT_TYPES: AlertType[] = ['join', 'drop', 'change', 'remind_day', 'remind_2h'];

/** Defaults from the design's Alerts screen. */
export const ALERT_DEFAULTS: Record<AlertType, { sms: boolean; email: boolean }> = {
  join: { sms: true, email: false },
  drop: { sms: true, email: true },
  change: { sms: true, email: true },
  remind_day: { sms: false, email: true },
  remind_2h: { sms: true, email: false },
};

/** Bursts of changes on one outing within this window go out as one text (SPEC §5). */
// Overridable so end-to-end tests don't have to wait.
export const COALESCE_SECONDS = Number(process.env.NOTIFY_COALESCE_SECONDS ?? 120);
export const MAX_ATTEMPTS = 5;

type EventType = (typeof outingEvents.$inferInsert)['type'];

const ALERT_FOR_EVENT: Partial<Record<EventType, AlertType>> = {
  slot_claimed: 'join',
  slot_released: 'drop',
  player_removed: 'drop',
  tee_time_added: 'change',
  tee_time_removed: 'change',
  capacity_changed: 'change',
  outing_updated: 'change',
};

// ---------------------------------------------------------------------------------------------
// Who can be reached, and how
// ---------------------------------------------------------------------------------------------

type Contact = {
  playerId: string;
  name: string;
  phone: string | null;
  email: string | null;
  smsOptedOut: boolean;
  quiet: { start: string; end: string } | null;
  timezone: string | null;
  prefs: Record<AlertType, { sms: boolean; email: boolean }>;
};

async function contactsFor(tx: Tx, playerIds: string[]): Promise<Map<string, Contact>> {
  const out = new Map<string, Contact>();
  if (!playerIds.length) return out;
  const rows = await tx
    .select({ player: players, user: users, settings: notificationSettings })
    .from(players)
    .leftJoin(users, eq(users.id, players.userId))
    .leftJoin(notificationSettings, eq(notificationSettings.playerId, players.id))
    .where(inArray(players.id, playerIds));
  const prefRows = await tx
    .select()
    .from(notificationPrefs)
    .where(inArray(notificationPrefs.playerId, playerIds));
  for (const { player, user, settings } of rows) {
    const prefs = structuredClone(ALERT_DEFAULTS);
    for (const p of prefRows)
      if (p.playerId === player.id) prefs[p.eventType] = { sms: p.sms, email: p.email };
    const quiet = !settings
      ? { ...DEFAULT_QUIET }
      : settings.quietStart && settings.quietEnd
        ? { start: settings.quietStart.slice(0, 5), end: settings.quietEnd.slice(0, 5) }
        : null;
    out.set(player.id, {
      playerId: player.id,
      name: player.displayName,
      phone:
        user?.phoneE164 && user.phoneVerifiedAt
          ? user.phoneE164
          : player.phoneVerifiedAt
            ? player.phoneE164
            : null,
      email: user && !user.disabledAt ? user.email : null,
      smsOptedOut: !!settings?.smsOptedOutAt,
      quiet,
      timezone: settings?.timezone ?? null,
      prefs,
    });
  }
  return out;
}

const canSms = (c: Contact) => !!c.phone && !c.smsOptedOut;

// ---------------------------------------------------------------------------------------------
// Fan-out: called by recordEvent inside the event's transaction
// ---------------------------------------------------------------------------------------------

export async function enqueueForEvent(
  tx: Tx,
  e: {
    id: number;
    outingId: string;
    type: EventType;
    actorPlayerId: string | null;
    payload: Record<string, unknown>;
  },
  now = new Date(),
) {
  const alert = ALERT_FOR_EVENT[e.type];
  if (!alert) return;
  const [outing] = await tx.select().from(outings).where(eq(outings.id, e.outingId));
  if (!outing) return;

  const holders = await tx
    .select({ playerId: slots.playerId })
    .from(slots)
    .where(and(eq(slots.outingId, outing.id), isNull(slots.guestOfPlayerId)));
  const removedId =
    e.type === 'player_removed' && typeof e.payload.playerId === 'string' ? e.payload.playerId : null;
  const recipients = new Set([
    outing.organizerPlayerId,
    ...holders.map((h) => h.playerId).filter((x): x is string => !!x),
  ]);
  if (e.actorPlayerId) recipients.delete(e.actorPlayerId);
  if (removedId) recipients.delete(removedId);

  const contacts = await contactsFor(tx, [...recipients, ...(removedId ? [removedId] : [])]);
  const base = new Date(now.getTime() + COALESCE_SECONDS * 1000);
  const rows: (typeof notifications.$inferInsert)[] = [];

  for (const id of recipients) {
    const c = contacts.get(id);
    if (!c) continue;
    if (c.prefs[alert].sms && canSms(c)) {
      rows.push({
        tenantId: outing.tenantId,
        playerId: id,
        outingId: outing.id,
        channel: 'sms',
        kind: 'change',
        key: `${id}:${outing.id}:sms:change`,
        eventIds: [e.id],
        sendAfter: nextSendTime(base, c.timezone ?? outing.timezone, c.quiet),
      });
    }
    if (c.prefs[alert].email && c.email) {
      rows.push({
        tenantId: outing.tenantId,
        playerId: id,
        outingId: outing.id,
        channel: 'email',
        kind: 'change',
        key: `${id}:${outing.id}:email:change`,
        eventIds: [e.id],
        sendAfter: base,
      });
    }
  }
  for (const row of rows) {
    await tx
      .insert(notifications)
      .values(row)
      .onConflictDoUpdate({
        target: notifications.key,
        targetWhere: sql`${notifications.status} = 'pending' and ${notifications.key} is not null`,
        set: { eventIds: sql`${notifications.eventIds} || excluded.event_ids`, updatedAt: now },
      });
  }

  // "Remove a player (they get a text)": always, unless they've opted out of texts.
  const removed = removedId ? contacts.get(removedId) : undefined;
  if (removed && (canSms(removed) || removed.email)) {
    const channel: Channel = canSms(removed) ? 'sms' : 'email';
    await tx.insert(notifications).values({
      tenantId: outing.tenantId,
      playerId: removed.playerId,
      outingId: outing.id,
      channel,
      kind: 'removed',
      eventIds: [e.id],
      sendAfter:
        channel === 'sms' ? nextSendTime(now, removed.timezone ?? outing.timezone, removed.quiet) : now,
    });
  }
}

// ---------------------------------------------------------------------------------------------
// Reminders (scheduled by the dispatcher each run; once per player, outing, channel and kind)
// ---------------------------------------------------------------------------------------------

export async function scheduleReminders(tx: Tx, tenantId: string, now = new Date()) {
  const from = new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10);
  const to = new Date(now.getTime() + 3 * 86_400_000).toISOString().slice(0, 10);
  const rows = await tx
    .select({
      outingId: outings.id,
      playDate: outings.playDate,
      timezone: outings.timezone,
      playerId: slots.playerId,
      startsAt: teeTimes.startsAt,
    })
    .from(outings)
    .innerJoin(slots, eq(slots.outingId, outings.id))
    .innerJoin(teeTimes, eq(teeTimes.id, slots.teeTimeId))
    .where(
      and(
        eq(outings.tenantId, tenantId),
        gte(outings.playDate, from),
        lte(outings.playDate, to),
        isNull(slots.guestOfPlayerId),
        sql`${slots.playerId} is not null`,
      ),
    );
  if (!rows.length) return 0;
  const contacts = await contactsFor(tx, [...new Set(rows.map((r) => r.playerId!))]);
  let created = 0;
  for (const r of rows) {
    const c = contacts.get(r.playerId!);
    if (!c || new Date(r.startsAt) <= now) continue;
    const dayBefore = new Date(`${r.playDate}T12:00:00Z`);
    dayBefore.setUTCDate(dayBefore.getUTCDate() - 1);
    const plans: { kind: 'remind_day' | 'remind_2h'; at: Date }[] = [
      { kind: 'remind_day', at: zonedTime(dayBefore.toISOString().slice(0, 10), 18 * 60, r.timezone) },
      { kind: 'remind_2h', at: new Date(new Date(r.startsAt).getTime() - 2 * 3_600_000) },
    ];
    for (const plan of plans) {
      // Don't send a reminder that's already badly late (e.g. someone joined the night before).
      if (plan.at.getTime() < now.getTime() - 30 * 60_000) continue;
      for (const channel of ['sms', 'email'] as const) {
        if (!c.prefs[plan.kind][channel]) continue;
        if (channel === 'sms' ? !canSms(c) : !c.email) continue;
        const inserted = await tx
          .insert(notifications)
          .values({
            tenantId,
            playerId: c.playerId,
            outingId: r.outingId,
            channel,
            kind: plan.kind,
            key: `${c.playerId}:${r.outingId}:${channel}:${plan.kind}`,
            sendAfter: plan.at,
          })
          .onConflictDoNothing()
          .returning({ id: notifications.id });
        created += inserted.length;
      }
    }
  }
  return created;
}

// ---------------------------------------------------------------------------------------------
// Composing messages
// ---------------------------------------------------------------------------------------------

const shortCourse = (name: string) =>
  name.replace(/\s+(Golf Course|Golf Club|Golf Links|Country Club)$/i, '').replace(/^The\s+/, '');
const timeIn = (iso: string, tz: string) =>
  new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz }).format(
    new Date(iso),
  );
const weekday = (playDate: string, style: 'short' | 'long') =>
  new Intl.DateTimeFormat('en-US', { weekday: style, timeZone: 'UTC' }).format(
    new Date(`${playDate}T12:00:00Z`),
  );
const dateLabel = (playDate: string) =>
  new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${playDate}T12:00:00Z`));
const firstName = (n: string) => n.trim().split(/\s+/)[0] ?? n;
const listNames = (names: string[]) =>
  names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} & ${names.at(-1)}`;

export type Composed = { sms: string; subject: string; email: string };

/** Builds the text/email for one notification. `link` is the outing's short link. */
export function compose(
  kind: (typeof notifications.$inferSelect)['kind'],
  view: OutingView,
  events: { type: EventType; payload: Record<string, unknown>; actorName: string | null }[],
  link: string,
): Composed | null {
  const tz = view.timezone;
  const course = shortCourse(view.course.name);
  const when = dateLabel(view.playDate);
  const filled = view.totalCount - view.openCount;
  const spots =
    view.openCount === 0 ? 'Full!' : `${view.openCount} ${view.openCount === 1 ? 'spot' : 'spots'} open.`;
  const mine = view.teeTimes.find((t) => t.slots.some((s) => s.isYou));

  if (kind === 'remind_day' || kind === 'remind_2h') {
    if (!mine) return null;
    const at = timeIn(mine.startsAt, tz);
    const place = view.course.address ? `${course} (${view.course.address})` : course;
    const others = mine.slots
      .filter((s) => !s.open && !s.isYou && s.tag !== 'guest')
      .map((s) => firstName(s.name ?? ''));
    const withWho = others.length ? ` You're with ${listNames(others)}.` : '';
    const sms =
      kind === 'remind_2h'
        ? `Ironed Out: Tee off at ${at}, ${place}.${withWho} Hit 'em straight. ${link}`
        : `Ironed Out: Tomorrow you tee off at ${at}, ${place}.${withWho} ${link}`;
    return {
      sms,
      subject: `${kind === 'remind_2h' ? 'Tee off soon' : 'Tomorrow'}: ${at} at ${view.course.name}`,
      email: `${sms
        .replace(/^Ironed Out: /, '')
        .replace(link, '')
        .trim()}\n\nDetails: ${link}`,
    };
  }

  if (kind === 'removed') {
    const org = firstName(view.organizerName);
    const sms = `Ironed Out: ${org} took you off the ${when} outing at ${course}. ${link}`;
    return {
      sms,
      subject: `You're off the ${when} outing at ${view.course.name}`,
      email: `${org} took you off the ${when} outing at ${view.course.name}.\n\n${link}`,
    };
  }

  // Change alerts: one event gets the design's wording; several are listed.
  const relevant = events.filter((e) => e.type !== 'outing_created');
  if (!relevant.length) return null;
  // `text` is the message without the link; `cta` is what goes right before the link in a text.
  let text: string;
  let cta = '';
  const one = relevant.length === 1 ? relevant[0]! : null;
  const who = (e: (typeof relevant)[number]) =>
    firstName(typeof e.payload.playerName === 'string' ? e.payload.playerName : (e.actorName ?? 'Someone'));
  if (one && one.type === 'slot_released' && typeof one.payload.startsAt === 'string') {
    text = `${who(one)} dropped out of ${weekday(view.playDate, 'short')} ${timeIn(one.payload.startsAt, tz)} at ${course}. ${spots}`;
    if (view.openCount > 0) cta = 'Grab it: ';
  } else if (one && one.type === 'slot_claimed' && typeof one.payload.startsAt === 'string') {
    const g = typeof one.payload.guestCount === 'number' ? one.payload.guestCount : 0;
    text = `${who(one)} grabbed the ${timeIn(one.payload.startsAt, tz)} spot${g ? ` (+${g} ${g === 1 ? 'guest' : 'guests'})` : ''}. ${weekday(view.playDate, 'long')} is now ${filled} of ${view.totalCount}.`;
  } else {
    const lines = relevant
      .map((e) =>
        describeEvent(
          { type: e.type, payload: e.payload },
          { timeZone: tz, organizerName: view.organizerName, actorName: e.actorName, isMember: true },
        ),
      )
      .filter((x): x is string => !!x);
    if (!lines.length) return null;
    text = `${course}, ${when}: ${lines.join(' ')} ${spots}`;
  }
  return {
    sms: `Ironed Out: ${text} ${cta}${link}`,
    subject: `${view.course.name} · ${when}: ${relevant.length === 1 ? 'an update' : `${relevant.length} updates`}`,
    email: `${text}

See the tee sheet: ${link}`,
  };
}

// ---------------------------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------------------------

export type DispatchDeps = {
  db: Db;
  sms: SmsSender;
  mailer: Mailer;
  secret: string;
  appUrl: string;
  now?: () => Date;
};

async function linkFor(tx: Tx, deps: DispatchDeps, outingId: string, now: Date) {
  const [link] = await tx
    .select({ id: inviteLinks.id })
    .from(inviteLinks)
    .where(
      and(
        eq(inviteLinks.outingId, outingId),
        isNull(inviteLinks.revokedAt),
        or(isNull(inviteLinks.expiresAt), sql`${inviteLinks.expiresAt} > ${now.toISOString()}`),
      ),
    )
    .orderBy(asc(inviteLinks.createdAt))
    .limit(1);
  return link
    ? `${deps.appUrl}/t/${derivedToken(deps.secret, `invite:${link.id}`)}`
    : `${deps.appUrl}/outings/${outingId}`;
}

type Outcome = 'sent' | 'skipped' | 'deferred' | 'failed' | 'retry';

async function processOne(
  deps: DispatchDeps,
  tenantId: string,
  id: string,
  now: Date,
): Promise<Outcome | null> {
  return withTenant(deps.db, tenantId, async (tx) => {
    const [n] = await tx
      .select()
      .from(notifications)
      .where(and(eq(notifications.id, id), eq(notifications.status, 'pending')))
      .for('update', { skipLocked: true });
    if (!n || n.sendAfter > now) return null;
    const skip = async (why: string) => {
      await tx
        .update(notifications)
        .set({ status: 'skipped', lastError: why })
        .where(eq(notifications.id, n.id));
      return 'skipped' as const;
    };

    const contact = (await contactsFor(tx, [n.playerId])).get(n.playerId);
    if (!contact) return skip('no player');
    if (n.channel === 'sms' && !canSms(contact)) return skip(contact.smsOptedOut ? 'opted out' : 'no phone');
    if (n.channel === 'email' && !contact.email) return skip('no email');
    if (!n.outingId) return skip('no outing');
    const view = await loadOutingView(tx, n.outingId, n.playerId);
    if (!view) return skip('outing gone');
    if (view.teeTimes.every((t) => new Date(t.startsAt) < now)) return skip('outing over');

    // Quiet hours (texts only; the 2-hour reminder is timed on purpose).
    if (n.channel === 'sms' && n.kind !== 'remind_2h') {
      const at = nextSendTime(now, contact.timezone ?? view.timezone, contact.quiet);
      if (at > now) {
        await tx.update(notifications).set({ sendAfter: at }).where(eq(notifications.id, n.id));
        return 'deferred';
      }
    }
    // If the tee time moved later, wait for the new 2-hour mark.
    if (n.kind === 'remind_2h') {
      const mine = view.teeTimes.find((t) => t.slots.some((s) => s.isYou));
      const due = mine ? new Date(new Date(mine.startsAt).getTime() - 2 * 3_600_000) : null;
      if (due && due.getTime() - now.getTime() > 5 * 60_000) {
        await tx.update(notifications).set({ sendAfter: due }).where(eq(notifications.id, n.id));
        return 'deferred';
      }
    }

    const events = n.eventIds.length
      ? await tx
          .select({ type: outingEvents.type, payload: outingEvents.payload, actorName: players.displayName })
          .from(outingEvents)
          .leftJoin(players, eq(players.id, outingEvents.actorPlayerId))
          .where(inArray(outingEvents.id, n.eventIds))
          .orderBy(asc(outingEvents.id))
      : [];
    const link = await linkFor(tx, deps, n.outingId, now);
    const msg = compose(n.kind, view, events, link);
    if (!msg) return skip('nothing to say');

    try {
      if (n.channel === 'sms') await deps.sms.send(contact.phone!, msg.sms);
      else await deps.mailer.send({ to: contact.email!, subject: msg.subject, text: msg.email });
    } catch (err) {
      const attempts = n.attempts + 1;
      await tx
        .update(notifications)
        .set({
          attempts,
          status: attempts >= MAX_ATTEMPTS ? 'failed' : 'pending',
          lastError: err instanceof Error ? err.message.slice(0, 200) : 'send failed',
          sendAfter: new Date(now.getTime() + 2 ** attempts * 60_000),
        })
        .where(eq(notifications.id, n.id));
      return attempts >= MAX_ATTEMPTS ? 'failed' : 'retry';
    }
    await tx
      .update(notifications)
      .set({
        status: 'sent',
        sentAt: now,
        // Keep the wording but not the link (it carries the invite token).
        body: (n.channel === 'sms' ? msg.sms : `${msg.subject}\n${msg.email}`).split(link).join('[link]'),
      })
      .where(eq(notifications.id, n.id));
    return 'sent';
  });
}

/** Schedules reminders and sends everything that's due, for every tenant. Safe to run concurrently. */
export async function runDispatch(deps: DispatchDeps, limit = 100) {
  const now = deps.now?.() ?? new Date();
  const totals: Record<Outcome | 'scheduled', number> = {
    scheduled: 0,
    sent: 0,
    skipped: 0,
    deferred: 0,
    failed: 0,
    retry: 0,
  };
  const tenantRows = await deps.db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.status, 'active'));
  for (const { id: tenantId } of tenantRows) {
    totals.scheduled += await withTenant(deps.db, tenantId, (tx) => scheduleReminders(tx, tenantId, now));
    const due = await withTenant(deps.db, tenantId, (tx) =>
      tx
        .select({ id: notifications.id })
        .from(notifications)
        .where(and(eq(notifications.status, 'pending'), lte(notifications.sendAfter, now)))
        .orderBy(asc(notifications.sendAfter))
        .limit(limit),
    );
    for (const { id } of due) {
      const outcome = await processOne(deps, tenantId, id, now);
      if (outcome) totals[outcome]++;
    }
  }
  return totals;
}

// ---------------------------------------------------------------------------------------------
// Settings (Alerts screen) and inbound STOP/START/HELP
// ---------------------------------------------------------------------------------------------

export type NotifyDeps = { db: Db; tenantId: string };

export type AlertSettings = {
  prefs: Record<AlertType, { sms: boolean; email: boolean }>;
  quietHours: boolean;
  smsOptedOut: boolean;
};

export async function getAlertSettings(deps: NotifyDeps, playerId: string): Promise<AlertSettings> {
  return withTenant(deps.db, deps.tenantId, async (tx) => {
    const c = (await contactsFor(tx, [playerId])).get(playerId);
    return {
      prefs: c?.prefs ?? structuredClone(ALERT_DEFAULTS),
      quietHours: c ? !!c.quiet : true,
      smsOptedOut: c?.smsOptedOut ?? false,
    };
  });
}

export const AlertPrefInput = z.object({
  type: z.enum(ALERT_TYPES as [AlertType, ...AlertType[]]),
  channel: z.enum(['sms', 'email']),
  on: z.boolean(),
});

export async function setAlertPref(deps: NotifyDeps, playerId: string, input: unknown) {
  const r = AlertPrefInput.safeParse(input);
  if (!r.success) throw new DomainError('invalid_input', 'That setting doesn’t exist.');
  const { type, channel, on } = r.data;
  await withTenant(deps.db, deps.tenantId, async (tx) => {
    const current = (await contactsFor(tx, [playerId])).get(playerId)?.prefs[type] ?? ALERT_DEFAULTS[type];
    const next = { ...current, [channel]: on };
    await tx
      .insert(notificationPrefs)
      .values({ playerId, eventType: type, sms: next.sms, email: next.email })
      .onConflictDoUpdate({
        target: [notificationPrefs.playerId, notificationPrefs.eventType],
        set: { sms: next.sms, email: next.email, updatedAt: new Date() },
      });
  });
}

async function upsertSettings(
  tx: Tx,
  playerId: string,
  set: Partial<typeof notificationSettings.$inferInsert>,
) {
  await tx
    .insert(notificationSettings)
    .values({
      playerId,
      quietStart: `${DEFAULT_QUIET.start}:00`,
      quietEnd: `${DEFAULT_QUIET.end}:00`,
      ...set,
    })
    .onConflictDoUpdate({ target: notificationSettings.playerId, set: { ...set, updatedAt: new Date() } });
}

export async function setQuietHours(deps: NotifyDeps, playerId: string, on: boolean) {
  await withTenant(deps.db, deps.tenantId, (tx) =>
    upsertSettings(
      tx,
      playerId,
      on
        ? { quietStart: `${DEFAULT_QUIET.start}:00`, quietEnd: `${DEFAULT_QUIET.end}:00` }
        : { quietStart: null, quietEnd: null },
    ),
  );
}

export async function setSmsOptOut(deps: NotifyDeps, playerId: string, optedOut: boolean) {
  await withTenant(deps.db, deps.tenantId, (tx) =>
    upsertSettings(tx, playerId, { smsOptedOutAt: optedOut ? new Date() : null }),
  );
}

/** Recent texts/emails for a player (shown on the Alerts screen, especially in SMS demo mode). */
export async function recentNotifications(deps: NotifyDeps, playerId: string, limit = 10) {
  return withTenant(deps.db, deps.tenantId, (tx) =>
    tx
      .select({
        id: notifications.id,
        channel: notifications.channel,
        kind: notifications.kind,
        status: notifications.status,
        body: notifications.body,
        sendAfter: notifications.sendAfter,
        sentAt: notifications.sentAt,
        course: courses.name,
      })
      .from(notifications)
      .leftJoin(outings, eq(outings.id, notifications.outingId))
      .leftJoin(courses, eq(courses.id, outings.courseId))
      .where(eq(notifications.playerId, playerId))
      .orderBy(sql`coalesce(${notifications.sentAt}, ${notifications.sendAfter}) desc`)
      .limit(limit),
  );
}

export type InboundReply = { reply: string | null; action: 'stop' | 'start' | 'help' | 'none' };

/** Inbound text from a phone (Twilio webhook). Records STOP/START for every player with that number. */
export async function handleInboundSms(db: Db, fromE164: string, text: string): Promise<InboundReply> {
  const word = text.trim().split(/\s+/)[0]?.toUpperCase() ?? '';
  const action = STOP_WORDS.includes(word)
    ? 'stop'
    : START_WORDS.includes(word)
      ? 'start'
      : HELP_WORDS.includes(word)
        ? 'help'
        : 'none';
  if (action === 'help') {
    return {
      action,
      reply:
        'Ironed Out: texts about golf outings you joined. Reply STOP to opt out. Msg & data rates may apply.',
    };
  }
  if (action === 'none') return { action, reply: null };
  const tenantRows = await db.select({ id: tenants.id }).from(tenants);
  for (const { id: tenantId } of tenantRows) {
    await withTenant(db, tenantId, async (tx) => {
      const viaPlayer = await tx
        .select({ id: players.id })
        .from(players)
        .where(eq(players.phoneE164, fromE164));
      const viaUser = await tx
        .select({ id: players.id })
        .from(players)
        .innerJoin(users, eq(users.id, players.userId))
        .where(eq(users.phoneE164, fromE164));
      for (const { id } of [...viaPlayer, ...viaUser]) {
        await upsertSettings(tx, id, { smsOptedOutAt: action === 'stop' ? new Date() : null });
      }
    });
  }
  // With Twilio Advanced Opt-Out, Twilio sends the STOP/START confirmations itself.
  return { action, reply: null };
}
