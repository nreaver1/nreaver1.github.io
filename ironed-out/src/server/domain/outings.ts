import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, max, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import { audit } from '../audit';
import { courses, outingEvents, outings, players, slots, teeTimes } from '../db/schema';
import { withTenant } from '../db/tenant';
import type { Db, Tx } from '../db/types';
import { DomainError } from '../errors';
import { parseInput } from '../validation';

export type OutingsDeps = { db: Db; tenantId: string; now?: () => Date };
export type Actor = { playerId: string; ip?: string | null };

export type OutingEventType = (typeof outingEvents.$inferInsert)['type'];

export const MAX_TEE_TIMES = 6;
export const MIN_CAPACITY = 2;
export const MAX_CAPACITY = 5;
export const INTERVALS = [8, 9, 10, 12] as const;

const Dollars = z
  .string()
  .trim()
  .transform((s) => s.replace(/^\$/, ''))
  .pipe(
    z.union([z.literal(''), z.string().regex(/^\d{1,4}(\.\d{1,2})?$/, 'Enter a price like 45 or 45.50.')]),
  )
  .transform((s) => (s === '' ? null : Math.round(Number(s) * 100)));

export const CreateOutingInput = z.object({
  courseId: z.uuid('Pick a course.'),
  playDate: z.iso.date('Pick a date.'),
  firstTeeMinutes: z.coerce.number().int().min(300).max(1140),
  teeTimeCount: z.coerce.number().int().min(1).max(MAX_TEE_TIMES),
  playersEach: z.coerce.number().int().min(MIN_CAPACITY).max(MAX_CAPACITY),
  intervalMinutes: z.coerce
    .number()
    .int()
    .refine((v) => (INTERVALS as readonly number[]).includes(v), 'Pick 8, 9, 10 or 12 minutes.'),
  price: Dollars.optional().transform((v) => v ?? null),
  note: z.string().trim().max(500, 'Keep the note under 500 characters.').default(''),
});

export const UpdateDetailsInput = z.object({
  price: Dollars.optional().transform((v) => v ?? null),
  note: z.string().trim().max(500, 'Keep the note under 500 characters.').default(''),
});

// ---------------------------------------------------------------------------------------------
// Read model
// ---------------------------------------------------------------------------------------------

export type SlotView = {
  id: string;
  position: number;
  open: boolean;
  name: string | null;
  tag: 'organizer' | 'guest' | null;
  /** The viewer's own slot (not a guest). */
  isYou: boolean;
  /** A guest the viewer brought. */
  isYourGuest: boolean;
  /** Stable per-player key for avatar colors; not an id. */
  colorKey: number;
};

export type TeeTimeView = {
  id: string;
  startsAt: string;
  capacity: number;
  filled: number;
  slots: SlotView[];
};

export type OutingView = {
  id: string;
  version: number;
  course: { id: string; name: string; address: string | null; city: string; region: string };
  organizerName: string;
  playDate: string;
  timezone: string;
  priceCents: number | null;
  note: string;
  locked: boolean;
  isOrganizer: boolean;
  /** Organizer or holds a slot: sees full names. Everyone else sees "First L." (SPEC §6). */
  isMember: boolean;
  viewerTeeTimeId: string | null;
  teeTimes: TeeTimeView[];
  openCount: number;
  totalCount: number;
  lastEventId: number;
};

const shortName = (name: string) => {
  const parts = name.trim().split(/\s+/);
  return parts.length < 2
    ? (parts[0] ?? '')
    : `${parts[0]} ${parts[parts.length - 1]!.charAt(0).toUpperCase()}.`;
};
const colorKeyOf = (id: string) => [...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

export async function loadOutingView(
  tx: Tx,
  outingId: string,
  viewerPlayerId: string | null,
): Promise<OutingView | null> {
  if (!z.uuid().safeParse(outingId).success) return null;
  const organizer = alias(players, 'organizer');
  const [o] = await tx
    .select({
      outing: outings,
      course: {
        id: courses.id,
        name: courses.name,
        address: courses.address,
        city: courses.city,
        region: courses.region,
      },
      organizerName: organizer.displayName,
    })
    .from(outings)
    .innerJoin(courses, eq(courses.id, outings.courseId))
    .innerJoin(organizer, eq(organizer.id, outings.organizerPlayerId))
    .where(eq(outings.id, outingId));
  if (!o) return null;

  const guestOf = alias(players, 'guest_of');
  const rows = await tx
    .select({
      teeTime: teeTimes,
      slot: slots,
      playerName: players.displayName,
      guestOfName: guestOf.displayName,
    })
    .from(teeTimes)
    .leftJoin(slots, eq(slots.teeTimeId, teeTimes.id))
    .leftJoin(players, eq(players.id, slots.playerId))
    .leftJoin(guestOf, eq(guestOf.id, slots.guestOfPlayerId))
    .where(eq(teeTimes.outingId, outingId))
    .orderBy(asc(teeTimes.startsAt), asc(teeTimes.sort), asc(slots.position));

  const [last] = await tx
    .select({ id: max(outingEvents.id) })
    .from(outingEvents)
    .where(eq(outingEvents.outingId, outingId));

  const isOrganizer = viewerPlayerId === o.outing.organizerPlayerId;
  const isMember =
    isOrganizer ||
    (!!viewerPlayerId &&
      rows.some((r) => r.slot?.playerId === viewerPlayerId || r.slot?.guestOfPlayerId === viewerPlayerId));
  const name = (n: string) => (isMember ? n : shortName(n));

  const byTee = new Map<string, TeeTimeView>();
  let viewerTeeTimeId: string | null = null;
  for (const r of rows) {
    let tee = byTee.get(r.teeTime.id);
    if (!tee) {
      tee = {
        id: r.teeTime.id,
        startsAt: new Date(r.teeTime.startsAt).toISOString(),
        capacity: r.teeTime.capacity,
        filled: 0,
        slots: [],
      };
      byTee.set(r.teeTime.id, tee);
    }
    const s = r.slot;
    if (!s) continue;
    const isGuest = !!s.guestOfPlayerId;
    const open = !s.playerId && !isGuest;
    if (!open) tee.filled++;
    const isYou = !!viewerPlayerId && s.playerId === viewerPlayerId;
    if (isYou) viewerTeeTimeId = tee.id;
    tee.slots.push({
      id: s.id,
      position: s.position,
      open,
      name: open
        ? null
        : isGuest
          ? `${name(r.guestOfName ?? 'Someone')}'s guest`
          : isYou && !isMember
            ? (r.playerName ?? '')
            : name(r.playerName ?? 'Someone'),
      tag: open ? null : isGuest ? 'guest' : s.playerId === o.outing.organizerPlayerId ? 'organizer' : null,
      isYou,
      isYourGuest: !!viewerPlayerId && s.guestOfPlayerId === viewerPlayerId,
      colorKey: colorKeyOf(s.playerId ?? s.guestOfPlayerId ?? s.id),
    });
  }
  const tees = [...byTee.values()];
  const totalCount = tees.reduce((n, t) => n + t.slots.length, 0);
  const openCount = tees.reduce((n, t) => n + t.slots.filter((s) => s.open).length, 0);

  return {
    id: o.outing.id,
    version: o.outing.version,
    course: o.course,
    organizerName: name(o.organizerName),
    playDate: o.outing.playDate,
    timezone: o.outing.timezone,
    priceCents: o.outing.priceCents,
    note: o.outing.note,
    locked: !!o.outing.lockedAt,
    isOrganizer,
    isMember,
    viewerTeeTimeId,
    teeTimes: tees,
    openCount,
    totalCount,
    lastEventId: Number(last?.id ?? 0),
  };
}

export function getOutingView(deps: OutingsDeps, outingId: string, viewerPlayerId: string | null) {
  return withTenant(deps.db, deps.tenantId, (tx) => loadOutingView(tx, outingId, viewerPlayerId));
}

/** Upcoming outings the player organizes or plays in, soonest first. */
export async function listUpcomingOutings(deps: OutingsDeps, playerId: string): Promise<OutingView[]> {
  const now = deps.now?.() ?? new Date();
  // A day of slack so an outing stays on Home through its play date in every US zone.
  const since = new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10);
  return withTenant(deps.db, deps.tenantId, async (tx) => {
    const mine = tx
      .select({ id: slots.outingId })
      .from(slots)
      .where(or(eq(slots.playerId, playerId), eq(slots.guestOfPlayerId, playerId)));
    const rows = await tx
      .select({ id: outings.id })
      .from(outings)
      .where(
        and(
          gte(outings.playDate, since),
          or(eq(outings.organizerPlayerId, playerId), inArray(outings.id, mine)),
        ),
      )
      .orderBy(asc(outings.playDate), desc(outings.createdAt))
      .limit(20);
    const views = await Promise.all(rows.map((r) => loadOutingView(tx, r.id, playerId)));
    return views
      .filter((v): v is OutingView => !!v)
      .sort((a, b) => (a.teeTimes[0]?.startsAt ?? '').localeCompare(b.teeTimes[0]?.startsAt ?? ''));
  });
}

// ---------------------------------------------------------------------------------------------
// Writes. Every change locks the outing row, writes an outing_events row and bumps the version,
// all in one transaction (CLAUDE.md rule).
// ---------------------------------------------------------------------------------------------

export async function recordEvent(
  tx: Tx,
  outingId: string,
  type: OutingEventType,
  actorPlayerId: string | null,
  payload: Record<string, unknown> = {},
): Promise<number> {
  const [e] = await tx
    .insert(outingEvents)
    .values({ outingId, type, actorPlayerId, payload })
    .returning({ id: outingEvents.id });
  await tx
    .update(outings)
    .set({ version: sql`${outings.version} + 1` })
    .where(eq(outings.id, outingId));
  return Number(e!.id);
}

export async function lockOuting(tx: Tx, outingId: string) {
  if (!z.uuid().safeParse(outingId).success) throw new DomainError('not_found', 'That outing is gone.');
  const [o] = await tx.select().from(outings).where(eq(outings.id, outingId)).for('update');
  if (!o) throw new DomainError('not_found', 'That outing is gone.');
  return o;
}

async function lockAsOrganizer(tx: Tx, outingId: string, actor: Actor, opts: { allowLocked?: boolean } = {}) {
  const o = await lockOuting(tx, outingId);
  if (o.organizerPlayerId !== actor.playerId) {
    throw new DomainError('forbidden', 'Only the organizer can change this outing.');
  }
  if (o.lockedAt && !opts.allowLocked) {
    throw new DomainError('conflict', 'This outing is locked. Unlock it to make changes.');
  }
  return o;
}

async function teeTimeOf(tx: Tx, teeTimeId: string) {
  if (!z.uuid().safeParse(teeTimeId).success) throw new DomainError('not_found', 'That tee time is gone.');
  const [t] = await tx.select().from(teeTimes).where(eq(teeTimes.id, teeTimeId));
  if (!t) throw new DomainError('not_found', 'That tee time is gone.');
  return t;
}

const iso = (d: Date | string) => new Date(d).toISOString();

export async function createOuting(deps: OutingsDeps, actor: Actor, input: unknown): Promise<string> {
  const data = parseInput(CreateOutingInput, input);
  return withTenant(deps.db, deps.tenantId, async (tx) => {
    const [course] = await tx.select().from(courses).where(eq(courses.id, data.courseId));
    if (!course)
      throw new DomainError('invalid_input', 'Pick a course.', { fields: { courseId: 'Pick a course.' } });
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: course.timezone }).format(
      deps.now?.() ?? new Date(),
    );
    if (data.playDate < today) {
      throw new DomainError('invalid_input', 'Pick a date that hasn’t happened yet.', {
        fields: { playDate: 'Pick a date that hasn’t happened yet.' },
      });
    }

    const [outing] = await tx
      .insert(outings)
      .values({
        tenantId: deps.tenantId,
        organizerPlayerId: actor.playerId,
        courseId: course.id,
        playDate: data.playDate,
        timezone: course.timezone,
        priceCents: data.price,
        note: data.note,
      })
      .returning({ id: outings.id });
    if (!outing) throw new Error('outing insert failed');

    for (let i = 0; i < data.teeTimeCount; i++) {
      const minutes = data.firstTeeMinutes + i * data.intervalMinutes;
      const [tee] = await tx
        .insert(teeTimes)
        .values({
          outingId: outing.id,
          // Local wall-clock time at the course → instant (Postgres handles DST).
          startsAt: sql`((${data.playDate}::date + make_interval(mins => ${minutes})) at time zone ${course.timezone})`,
          capacity: data.playersEach,
          sort: i,
        })
        .returning({ id: teeTimes.id });
      await tx.insert(slots).values(
        Array.from({ length: data.playersEach }, (_, position) => ({
          teeTimeId: tee!.id,
          outingId: outing.id,
          position,
          // The organizer fills slot 1 of the first tee time.
          ...(i === 0 && position === 0 ? { playerId: actor.playerId, claimedAt: new Date() } : {}),
        })),
      );
    }
    await recordEvent(tx, outing.id, 'outing_created', actor.playerId, {
      teeTimes: data.teeTimeCount,
      spots: data.teeTimeCount * data.playersEach,
    });
    return outing.id;
  });
}

export async function updateDetails(deps: OutingsDeps, actor: Actor, outingId: string, input: unknown) {
  const data = parseInput(UpdateDetailsInput, input);
  await withTenant(deps.db, deps.tenantId, async (tx) => {
    const o = await lockAsOrganizer(tx, outingId, actor, { allowLocked: true });
    const changed: string[] = [];
    if (o.note !== data.note) changed.push('note');
    if (o.priceCents !== data.price) changed.push('price');
    if (!changed.length) return;
    await tx.update(outings).set({ note: data.note, priceCents: data.price }).where(eq(outings.id, o.id));
    await recordEvent(tx, o.id, 'outing_updated', actor.playerId, { fields: changed });
  });
}

export async function addTeeTime(deps: OutingsDeps, actor: Actor, outingId: string) {
  await withTenant(deps.db, deps.tenantId, async (tx) => {
    const o = await lockAsOrganizer(tx, outingId, actor);
    const tees = await tx
      .select()
      .from(teeTimes)
      .where(eq(teeTimes.outingId, o.id))
      .orderBy(asc(teeTimes.startsAt), asc(teeTimes.sort));
    if (tees.length >= MAX_TEE_TIMES) {
      throw new DomainError('conflict', `An outing can have up to ${MAX_TEE_TIMES} tee times.`);
    }
    const last = tees[tees.length - 1]!;
    const prev = tees[tees.length - 2];
    const gapMs = prev ? new Date(last.startsAt).getTime() - new Date(prev.startsAt).getTime() : 10 * 60_000;
    const startsAt = new Date(new Date(last.startsAt).getTime() + (gapMs > 0 ? gapMs : 10 * 60_000));
    const [tee] = await tx
      .insert(teeTimes)
      .values({
        outingId: o.id,
        startsAt,
        capacity: last.capacity,
        sort: Math.max(...tees.map((t) => t.sort)) + 1,
      })
      .returning({ id: teeTimes.id });
    await tx.insert(slots).values(
      Array.from({ length: last.capacity }, (_, position) => ({
        teeTimeId: tee!.id,
        outingId: o.id,
        position,
      })),
    );
    await recordEvent(tx, o.id, 'tee_time_added', actor.playerId, {
      teeTimeId: tee!.id,
      startsAt: startsAt.toISOString(),
      spots: last.capacity,
    });
  });
}

export async function changeCapacity(deps: OutingsDeps, actor: Actor, teeTimeId: string, delta: 1 | -1) {
  await withTenant(deps.db, deps.tenantId, async (tx) => {
    const t0 = await teeTimeOf(tx, teeTimeId);
    const o = await lockAsOrganizer(tx, t0.outingId, actor);
    const tee = await teeTimeOf(tx, teeTimeId); // re-read under the outing lock
    const rows = await tx
      .select()
      .from(slots)
      .where(eq(slots.teeTimeId, tee.id))
      .orderBy(desc(slots.position));
    const to = tee.capacity + delta;
    if (to > MAX_CAPACITY)
      throw new DomainError('conflict', `A tee time holds at most ${MAX_CAPACITY} players.`);
    if (to < MIN_CAPACITY)
      throw new DomainError('conflict', `A tee time needs at least ${MIN_CAPACITY} spots.`);

    if (delta === 1) {
      const position = (rows[0]?.position ?? -1) + 1;
      await tx.insert(slots).values({ teeTimeId: tee.id, outingId: o.id, position });
    } else {
      const empty = rows.find((s) => !s.playerId && !s.guestOfPlayerId);
      if (!empty) throw new DomainError('conflict', 'Every spot in that tee time is taken.');
      await tx.delete(slots).where(eq(slots.id, empty.id));
    }
    await tx.update(teeTimes).set({ capacity: to }).where(eq(teeTimes.id, tee.id));
    await recordEvent(tx, o.id, 'capacity_changed', actor.playerId, {
      teeTimeId: tee.id,
      startsAt: iso(tee.startsAt),
      from: tee.capacity,
      to,
    });
  });
}

export async function deleteTeeTime(deps: OutingsDeps, actor: Actor, teeTimeId: string) {
  await withTenant(deps.db, deps.tenantId, async (tx) => {
    const t0 = await teeTimeOf(tx, teeTimeId);
    const o = await lockAsOrganizer(tx, t0.outingId, actor);
    const [count] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(teeTimes)
      .where(eq(teeTimes.outingId, o.id));
    if ((count?.n ?? 0) <= 1) throw new DomainError('conflict', 'An outing needs at least one tee time.');
    const taken = await tx
      .select({ id: slots.id })
      .from(slots)
      .where(
        and(eq(slots.teeTimeId, t0.id), or(isNotNull(slots.playerId), isNotNull(slots.guestOfPlayerId))),
      );
    if (taken.length) throw new DomainError('conflict', 'Only an empty tee time can be deleted.');
    await tx.delete(teeTimes).where(eq(teeTimes.id, t0.id));
    await recordEvent(tx, o.id, 'tee_time_removed', actor.playerId, { startsAt: iso(t0.startsAt) });
  });
}

/** Organizer removes a player (and the guests they brought) or a single guest. */
export async function removePlayer(deps: OutingsDeps, actor: Actor, slotId: string) {
  await withTenant(deps.db, deps.tenantId, async (tx) => {
    if (!z.uuid().safeParse(slotId).success) throw new DomainError('not_found', 'That spot is gone.');
    const [s0] = await tx.select().from(slots).where(eq(slots.id, slotId));
    if (!s0) throw new DomainError('not_found', 'That spot is gone.');
    const o = await lockAsOrganizer(tx, s0.outingId, actor);
    const [s] = await tx.select().from(slots).where(eq(slots.id, slotId)).for('update');
    if (!s || (!s.playerId && !s.guestOfPlayerId))
      throw new DomainError('conflict', 'That spot is already open.');
    if (s.playerId === o.organizerPlayerId) {
      throw new DomainError('conflict', 'You can’t remove yourself from your own outing.');
    }
    const tee = await teeTimeOf(tx, s.teeTimeId);

    if (s.guestOfPlayerId) {
      const [host] = await tx.select().from(players).where(eq(players.id, s.guestOfPlayerId));
      await clearSlots(tx, [s.id]);
      await recordEvent(tx, o.id, 'player_removed', actor.playerId, {
        playerName: `${host?.displayName ?? 'Someone'}'s guest`,
        guest: true,
        startsAt: iso(tee.startsAt),
        slotIds: [s.id],
      });
      return;
    }

    const playerId = s.playerId!;
    const [player] = await tx.select().from(players).where(eq(players.id, playerId));
    const guestSlots = await tx
      .select({ id: slots.id })
      .from(slots)
      .where(and(eq(slots.outingId, o.id), eq(slots.guestOfPlayerId, playerId)));
    const ids = [s.id, ...guestSlots.map((g) => g.id)];
    await clearSlots(tx, ids);
    await recordEvent(tx, o.id, 'player_removed', actor.playerId, {
      playerId,
      playerName: player?.displayName ?? 'Someone',
      startsAt: iso(tee.startsAt),
      guestCount: guestSlots.length,
      slotIds: ids,
    });
    await audit(tx, {
      tenantId: deps.tenantId,
      actor: `player:${actor.playerId}`,
      action: 'outing.player_removed',
      target: `player:${playerId}`,
      ip: actor.ip,
      meta: { outingId: o.id, guestCount: guestSlots.length },
    });
  });
}

export async function clearSlots(tx: Tx, ids: string[]) {
  if (!ids.length) return;
  await tx
    .update(slots)
    .set({ playerId: null, guestOfPlayerId: null, claimedAt: null })
    .where(inArray(slots.id, ids));
}

export async function setLocked(deps: OutingsDeps, actor: Actor, outingId: string, locked: boolean) {
  await withTenant(deps.db, deps.tenantId, async (tx) => {
    const o = await lockAsOrganizer(tx, outingId, actor, { allowLocked: true });
    if (!!o.lockedAt === locked) return;
    await tx
      .update(outings)
      .set({ lockedAt: locked ? new Date() : null })
      .where(eq(outings.id, o.id));
    await recordEvent(tx, o.id, locked ? 'locked' : 'unlocked', actor.playerId);
    await audit(tx, {
      tenantId: deps.tenantId,
      actor: `player:${actor.playerId}`,
      action: locked ? 'outing.locked' : 'outing.unlocked',
      target: `outing:${o.id}`,
      ip: actor.ip,
    });
  });
}

/** Open slots in claim order: the given tee time first, then the rest by start time. */
export async function openSlotsInOrder(tx: Tx, outingId: string, preferTeeTimeId: string | null) {
  const rows = await tx
    .select({
      id: slots.id,
      teeTimeId: slots.teeTimeId,
      position: slots.position,
      startsAt: teeTimes.startsAt,
    })
    .from(slots)
    .innerJoin(teeTimes, eq(teeTimes.id, slots.teeTimeId))
    .where(and(eq(slots.outingId, outingId), isNull(slots.playerId), isNull(slots.guestOfPlayerId)))
    .orderBy(asc(teeTimes.startsAt), asc(teeTimes.sort), asc(slots.position))
    .for('update', { of: slots });
  return [
    ...rows.filter((r) => r.teeTimeId === preferTeeTimeId),
    ...rows.filter((r) => r.teeTimeId !== preferTeeTimeId),
  ];
}

export async function getPlayerName(deps: OutingsDeps, playerId: string): Promise<string | null> {
  if (!z.uuid().safeParse(playerId).success) return null;
  return withTenant(deps.db, deps.tenantId, async (tx) => {
    const [p] = await tx.select({ name: players.displayName }).from(players).where(eq(players.id, playerId));
    return p?.name ?? null;
  });
}
