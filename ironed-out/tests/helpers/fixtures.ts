import { eq } from 'drizzle-orm';
import { courses, players } from '@/server/db/schema';
import { withTenant } from '@/server/db/tenant';
import { createOuting, type OutingsDeps } from '@/server/domain/outings';
import type { TestDb } from './db';

export async function makePlayer(t: TestDb, displayName: string, phoneE164: string | null = null) {
  return withTenant(t.db, t.tenantId, async (tx) => {
    const [p] = await tx.insert(players).values({ tenantId: t.tenantId, displayName, phoneE164 }).returning();
    return p!;
  });
}

export async function courseId(t: TestDb, name = 'Mount Pleasant Golf Course') {
  const [c] = await t.db.select({ id: courses.id }).from(courses).where(eq(courses.name, name));
  return c!.id;
}

/** Saturday a few weeks out, so "not in the past" checks never trip. */
export function futureSaturday(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 21 + ((6 - d.getUTCDay() + 7) % 7));
  return d.toISOString().slice(0, 10);
}

export async function makeOuting(
  t: TestDb,
  organizerId: string,
  opts: Partial<{
    teeTimeCount: number;
    playersEach: number;
    firstTeeMinutes: number;
    intervalMinutes: number;
  }> = {},
) {
  const deps: OutingsDeps = { db: t.db, tenantId: t.tenantId };
  return createOuting(
    deps,
    { playerId: organizerId },
    {
      courseId: await courseId(t),
      playDate: futureSaturday(),
      firstTeeMinutes: opts.firstTeeMinutes ?? 460,
      teeTimeCount: opts.teeTimeCount ?? 3,
      playersEach: opts.playersEach ?? 4,
      intervalMinutes: opts.intervalMinutes ?? 10,
      price: '45',
      note: 'Walking unless it rains.',
    },
  );
}
