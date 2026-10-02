import { and, desc, eq, gte } from 'drizzle-orm';
import { courses, outings, players, slots } from '../db/schema';
import { withTenant } from '../db/tenant';
import { createOuting, getOutingView, type OutingsDeps } from './outings';
import { ensureInviteLink, type InviteDeps } from './invites';

export const DEMO_REF = 'demo';
const DEMO_ORGANIZER = 'Mike Golfer';
/** Who's already in, per tee time (slot 0 of the first tee is the organizer). */
const DEMO_LINEUP: (string | { guestOf: string })[][] = [
  ['Marcus Reed', 'Jen Putts', { guestOf: 'Jen Putts' }],
  ['Tony Fairway', 'Priya Shah', 'Sam Bunker'],
  ['Dee Long'],
];

function nextSaturday(timeZone: string, now: Date): string {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone }).format(now);
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + ((6 - d.getUTCDay() + 7) % 7 || 7));
  return d.toISOString().slice(0, 10);
}

async function player(deps: OutingsDeps, name: string) {
  return withTenant(deps.db, deps.tenantId, async (tx) => {
    const [p] = await tx
      .insert(players)
      .values({ tenantId: deps.tenantId, displayName: name })
      .returning({ id: players.id });
    return p!.id;
  });
}

/**
 * The portfolio demo: a sample outing next Saturday at Mount Pleasant, partly filled like the
 * design. Reused until it's in the past or full, then a fresh one is made. Returns its invite token.
 */
export async function ensureDemoOuting(deps: OutingsDeps & InviteDeps): Promise<string> {
  const now = deps.now?.() ?? new Date();
  const existing = await withTenant(deps.db, deps.tenantId, async (tx) => {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(now);
    return tx
      .select({ id: outings.id, organizer: outings.organizerPlayerId })
      .from(outings)
      .where(
        and(
          eq(outings.tenantId, deps.tenantId),
          eq(outings.externalRef, DEMO_REF),
          gte(outings.playDate, today),
        ),
      )
      .orderBy(desc(outings.createdAt))
      .limit(1);
  });
  const current = existing[0];
  if (current) {
    const view = await getOutingView(deps, current.id, null);
    if (view && view.openCount > 0 && !view.locked) {
      return (await ensureInviteLink(deps, { playerId: current.organizer }, current.id)).token;
    }
  }

  const organizer = await player(deps, DEMO_ORGANIZER);
  const [course] = await deps.db
    .select({ id: courses.id, timezone: courses.timezone })
    .from(courses)
    .where(eq(courses.name, 'Mount Pleasant Golf Course'));
  if (!course) throw new Error('Seed courses first');
  const outingId = await createOuting(
    deps,
    { playerId: organizer },
    {
      courseId: course.id,
      playDate: nextSaturday(course.timezone, now),
      firstTeeMinutes: 460,
      teeTimeCount: 3,
      playersEach: 4,
      intervalMinutes: 10,
      price: '45',
      note: 'Walking unless it rains. Crab cakes after.',
    },
  );

  const ids = new Map<string, string>();
  for (const row of DEMO_LINEUP)
    for (const who of row) if (typeof who === 'string') ids.set(who, await player(deps, who));

  const view = await getOutingView(deps, outingId, null);
  await withTenant(deps.db, deps.tenantId, async (tx) => {
    await tx.update(outings).set({ externalRef: DEMO_REF }).where(eq(outings.id, outingId));
    for (const [i, row] of DEMO_LINEUP.entries()) {
      const open = view!.teeTimes[i]!.slots.filter((s) => s.open);
      for (const [j, who] of row.entries()) {
        const slotId = open[j]!.id;
        await tx
          .update(slots)
          .set(
            typeof who === 'string'
              ? { playerId: ids.get(who)!, claimedAt: now }
              : { guestOfPlayerId: ids.get(who.guestOf)!, claimedAt: now },
          )
          .where(eq(slots.id, slotId));
      }
    }
  });
  return (await ensureInviteLink(deps, { playerId: organizer }, outingId)).token;
}
