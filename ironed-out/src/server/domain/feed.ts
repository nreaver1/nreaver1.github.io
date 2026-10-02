import { and, desc, eq, gt, sql } from 'drizzle-orm';
import { z } from 'zod';
import { outingEvents, outings, players, outingViews } from '../db/schema';
import { withTenant } from '../db/tenant';
import type { Tx } from '../db/types';
import type { OutingsDeps, OutingView } from './outings';

/** One line in the "Since you last looked" banner. */
export type FeedItem = { id: number; text: string };

export type Feed = {
  /** False on a first visit: there's no "since" yet. */
  hasRecord: boolean;
  lastSeenEventId: number;
  items: FeedItem[];
  /** How many more changes didn't fit in the banner. */
  more: number;
  /** Slots that opened since the last visit and are still open. */
  freshSlotIds: string[];
  /** Tee times added since the last visit. */
  newTeeTimeIds: string[];
};

export const BANNER_MAX_ITEMS = 5;

type EventRow = typeof outingEvents.$inferSelect;
type Payload = Record<string, unknown>;

const str = (p: Payload, k: string) => (typeof p[k] === 'string' ? (p[k] as string) : '');
const num = (p: Payload, k: string) => (typeof p[k] === 'number' ? (p[k] as number) : 0);
const ids = (p: Payload, k: string) =>
  Array.isArray(p[k]) ? (p[k] as unknown[]).filter((x): x is string => typeof x === 'string') : [];

const shortName = (name: string) => {
  const parts = name.trim().split(/\s+/);
  return parts.length < 2
    ? (parts[0] ?? '')
    : `${parts[0]} ${parts[parts.length - 1]!.charAt(0).toUpperCase()}.`;
};

/** Turns one event into a human sentence, or null when it isn't worth a banner line. */
export function describeEvent(
  e: Pick<EventRow, 'type' | 'payload'>,
  ctx: { timeZone: string; organizerName: string; actorName: string | null; isMember: boolean },
): string | null {
  const p = e.payload;
  const name = (n: string) => (ctx.isMember ? n : shortName(n));
  const time = (iso: string) =>
    iso
      ? new Intl.DateTimeFormat('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          timeZone: ctx.timeZone,
        }).format(new Date(iso))
      : '';
  const org = name(ctx.organizerName).split(' ')[0];
  const who = name(str(p, 'playerName') || ctx.actorName || 'Someone');
  const at = time(str(p, 'startsAt'));
  const guests = num(p, 'guestCount');
  const spots = (n: number) => (n === 1 ? 'A spot' : `${n} spots`);

  switch (e.type) {
    case 'slot_released':
      return `${who} dropped out. ${spots(1 + guests)} opened at ${at}.`;
    case 'player_removed':
      return p.guest === true
        ? `${who} is out. A spot opened at ${at}.`
        : `${who} is out. ${spots(1 + guests)} opened at ${at}.`;
    case 'slot_claimed':
      if (!guests) return `${who} grabbed ${at}.`;
      return `${who} grabbed ${at} and is bringing ${guests === 1 ? 'a guest' : `${guests} guests`}.`;
    case 'tee_time_added':
      return `${org} added ${/^(8|11):/.test(at) ? 'an' : 'a'} ${at} tee time.`;
    case 'tee_time_removed':
      return `The ${at} tee time was dropped.`;
    case 'capacity_changed': {
      const to = num(p, 'to');
      return num(p, 'from') < to ? `${at} has room for ${to} now.` : `${at} is down to ${to} spots.`;
    }
    case 'locked':
      return `${org} locked it in. The tee sheet is set.`;
    case 'unlocked':
      return `${org} unlocked the tee sheet.`;
    case 'outing_updated': {
      const fields = ids(p, 'fields');
      if (fields.includes('note') && fields.includes('price'))
        return `${org} changed the price and the note.`;
      if (fields.includes('price')) return `${org} changed the price.`;
      return `${org} updated the note.`;
    }
    default:
      return null;
  }
}

export function viewerKeyOf(playerId: string | null, anonKey: string | null): string | null {
  return playerId ?? (anonKey ? `anon:${anonKey}` : null);
}

async function lastSeen(tx: Tx, outingId: string, viewerKey: string | null) {
  if (!viewerKey) return null;
  const [row] = await tx
    .select({ id: outingViews.lastSeenEventId })
    .from(outingViews)
    .where(and(eq(outingViews.outingId, outingId), eq(outingViews.viewerKey, viewerKey)));
  return row ? Number(row.id) : null;
}

/** What changed since this viewer last looked, from the outing's event log. */
export async function getFeed(
  deps: OutingsDeps,
  view: OutingView,
  viewerKey: string | null,
  viewerPlayerId: string | null,
): Promise<Feed> {
  return withTenant(deps.db, deps.tenantId, async (tx) => {
    const seen = await lastSeen(tx, view.id, viewerKey);
    if (seen === null) {
      return {
        hasRecord: false,
        lastSeenEventId: 0,
        items: [],
        more: 0,
        freshSlotIds: [],
        newTeeTimeIds: [],
      };
    }
    const rows = await tx
      .select({ event: outingEvents, actorName: players.displayName })
      .from(outingEvents)
      .leftJoin(players, eq(players.id, outingEvents.actorPlayerId))
      .where(and(eq(outingEvents.outingId, view.id), gt(outingEvents.id, seen)))
      .orderBy(desc(outingEvents.id))
      .limit(200);

    const [o] = await tx
      .select({ organizerName: players.displayName })
      .from(outings)
      .innerJoin(players, eq(players.id, outings.organizerPlayerId))
      .where(eq(outings.id, view.id));

    const openNow = new Set(view.teeTimes.flatMap((t) => t.slots.filter((s) => s.open).map((s) => s.id)));
    const teeNow = new Set(view.teeTimes.map((t) => t.id));
    const fresh = new Set<string>();
    const newTees = new Set<string>();
    const texts: FeedItem[] = [];
    const seenTexts = new Set<string>();

    for (const { event, actorName } of rows) {
      // Your own changes aren't news to you.
      if (viewerPlayerId && event.actorPlayerId === viewerPlayerId) continue;
      const p = event.payload;
      if (event.type === 'slot_released' || event.type === 'player_removed') {
        for (const id of ids(p, 'slotIds')) if (openNow.has(id)) fresh.add(id);
      }
      if (event.type === 'tee_time_added' && teeNow.has(str(p, 'teeTimeId')))
        newTees.add(str(p, 'teeTimeId'));
      const text = describeEvent(event, {
        timeZone: view.timezone,
        organizerName: o?.organizerName ?? 'The organizer',
        actorName,
        isMember: view.isMember,
      });
      if (text && !seenTexts.has(text)) {
        seenTexts.add(text);
        texts.push({ id: Number(event.id), text });
      }
    }
    return {
      hasRecord: true,
      lastSeenEventId: seen,
      items: texts.slice(0, BANNER_MAX_ITEMS),
      more: Math.max(0, texts.length - BANNER_MAX_ITEMS),
      freshSlotIds: [...fresh],
      newTeeTimeIds: [...newTees],
    };
  });
}

/** Records that the viewer has seen everything up to `lastEventId` (never moves backwards). */
export async function markSeen(deps: OutingsDeps, outingId: string, viewerKey: string, lastEventId: number) {
  if (!z.uuid().safeParse(outingId).success || viewerKey.length > 120) return;
  const upTo = Math.max(0, Math.floor(lastEventId));
  await withTenant(deps.db, deps.tenantId, async (tx) => {
    // Clamp to events that exist so a client can't skip ahead of the log.
    const [max] = await tx
      .select({ id: sql<number>`coalesce(max(${outingEvents.id}), 0)` })
      .from(outingEvents)
      .where(eq(outingEvents.outingId, outingId));
    const value = Math.min(upTo, Number(max?.id ?? 0));
    await tx
      .insert(outingViews)
      .values({ outingId, viewerKey, lastSeenEventId: value })
      .onConflictDoUpdate({
        target: [outingViews.outingId, outingViews.viewerKey],
        set: {
          lastSeenEventId: sql`greatest(${outingViews.lastSeenEventId}, excluded.last_seen_event_id)`,
          updatedAt: new Date(),
        },
      });
  });
}
