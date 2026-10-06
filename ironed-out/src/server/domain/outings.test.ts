import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { formatTime } from '@/lib/format';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import { courseId, futureSaturday, makeOuting, makePlayer } from '../../../tests/helpers/fixtures';
import { auditLog, outingEvents, slots, tenants } from '../db/schema';
import { withTenant } from '../db/tenant';
import { SeedProvider } from './courses';
import {
  addTeeTime,
  changeCapacity,
  createOuting,
  deleteOuting,
  deleteTeeTime,
  getOutingView,
  listUpcomingOutings,
  removePlayer,
  setLocked,
  updateDetails,
  type OutingsDeps,
} from './outings';

let t: TestDb;
let deps: OutingsDeps;
let mike: { id: string };
let jen: { id: string };

beforeAll(async () => {
  t = await createTestDb();
  deps = { db: t.db, tenantId: t.tenantId };
  mike = await makePlayer(t, 'Mike Golfer');
  jen = await makePlayer(t, 'Jen Putts');
});
afterAll(async () => {
  await t.pg.close();
});

const events = (outingId: string) =>
  withTenant(t.db, t.tenantId, (tx) =>
    tx.select().from(outingEvents).where(eq(outingEvents.outingId, outingId)).orderBy(outingEvents.id),
  );

/** Puts Jen (and optionally a guest of hers) into a tee time directly. */
async function seat(outingId: string, teeIndex: number, position: number, guestPosition?: number) {
  const view = await getOutingView(deps, outingId, null);
  const tee = view!.teeTimes[teeIndex]!;
  await withTenant(t.db, t.tenantId, async (tx) => {
    await tx.update(slots).set({ playerId: jen.id }).where(eq(slots.id, tee.slots[position]!.id));
    if (guestPosition !== undefined) {
      await tx
        .update(slots)
        .set({ guestOfPlayerId: jen.id })
        .where(eq(slots.id, tee.slots[guestPosition]!.id));
    }
  });
  return tee;
}

describe('course search', () => {
  const provider = () => new SeedProvider(t.db);

  it('lists nearby courses closest first by default', async () => {
    const results = await provider().search({});
    expect(results.length).toBeGreaterThan(10);
    expect(results.every((r) => r.distanceMiles <= 120)).toBe(true);
    expect(results.map((r) => r.name)).not.toContain('Pebble Beach Golf Links');
    const miles = results.map((r) => r.distanceMiles);
    expect([...miles].sort((a, b) => a - b)).toEqual(miles);
  });

  it('matches names and towns, including typos, and widens with scope=all', async () => {
    expect((await provider().search({ query: 'mount pleas' }))[0]?.name).toBe('Mount Pleasant Golf Course');
    expect((await provider().search({ query: 'Essex' })).map((r) => r.name)).toContain(
      'Rocky Point Golf Course',
    );
    expect((await provider().search({ query: 'pebble' })).length).toBe(0);
    expect((await provider().search({ query: 'pebble', scope: 'all' }))[0]?.name).toBe(
      'Pebble Beach Golf Links',
    );
    expect((await provider().search({ query: 'Pinehrst', scope: 'all' }))[0]?.name).toBe('Pinehurst No. 2');
  });

  it('treats LIKE wildcards in the query literally', async () => {
    expect(await provider().search({ query: '%', scope: 'all' })).toEqual([]);
  });
});

describe('create outing', () => {
  it('builds tee times in the course zone, seats the organizer and logs the event', async () => {
    const id = await makeOuting(t, mike.id);
    const view = (await getOutingView(deps, id, mike.id))!;
    expect(view.teeTimes.map((tt) => formatTime(tt.startsAt, view.timezone))).toEqual([
      '7:40 AM',
      '7:50 AM',
      '8:00 AM',
    ]);
    expect(view.totalCount).toBe(12);
    expect(view.openCount).toBe(11);
    expect(view.teeTimes[0]!.slots[0]).toMatchObject({ isYou: true, tag: 'organizer', name: 'Mike Golfer' });
    expect(view.priceCents).toBe(4500);
    expect(view.isOrganizer).toBe(true);
    expect((await events(id)).map((e) => e.type)).toEqual(['outing_created']);
  });

  it('validates the input', async () => {
    const base = {
      courseId: await courseId(t),
      playDate: futureSaturday(),
      firstTeeMinutes: 460,
      teeTimeCount: 3,
      playersEach: 4,
      intervalMinutes: 10,
    };
    await expect(
      createOuting(deps, { playerId: mike.id }, { ...base, teeTimeCount: 7 }),
    ).rejects.toMatchObject({
      code: 'invalid_input',
    });
    await expect(
      createOuting(deps, { playerId: mike.id }, { ...base, intervalMinutes: 11 }),
    ).rejects.toMatchObject({
      code: 'invalid_input',
    });
    await expect(
      createOuting(deps, { playerId: mike.id }, { ...base, playDate: '2020-01-04' }),
    ).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(createOuting(deps, { playerId: mike.id }, { ...base, price: 'free' })).rejects.toMatchObject(
      {
        code: 'invalid_input',
      },
    );
  });

  it('shows short names to people who are not in the outing', async () => {
    const id = await makeOuting(t, mike.id);
    const view = (await getOutingView(deps, id, null))!;
    expect(view.organizerName).toBe('Mike G.');
    expect(view.teeTimes[0]!.slots[0]!.name).toBe('Mike G.');
    expect(view.isMember).toBe(false);
  });

  it('shows up on Home for the organizer and for players', async () => {
    const id = await makeOuting(t, mike.id);
    await seat(id, 1, 0);
    expect((await listUpcomingOutings(deps, mike.id)).map((o) => o.id)).toContain(id);
    expect((await listUpcomingOutings(deps, jen.id)).map((o) => o.id)).toContain(id);
  });
});

describe('organizer controls', () => {
  it('adds a tee time at the same interval and capacity', async () => {
    const id = await makeOuting(t, mike.id, { teeTimeCount: 2, intervalMinutes: 9, playersEach: 3 });
    await addTeeTime(deps, { playerId: mike.id }, id);
    const view = (await getOutingView(deps, id, mike.id))!;
    expect(view.teeTimes.map((tt) => formatTime(tt.startsAt, view.timezone))).toEqual([
      '7:40 AM',
      '7:49 AM',
      '7:58 AM',
    ]);
    expect(view.teeTimes[2]!.capacity).toBe(3);
    expect((await events(id)).at(-1)?.type).toBe('tee_time_added');
  });

  it('stops at 6 tee times', async () => {
    const id = await makeOuting(t, mike.id, { teeTimeCount: 6 });
    await expect(addTeeTime(deps, { playerId: mike.id }, id)).rejects.toMatchObject({ code: 'conflict' });
  });

  it('changes capacity within 2–5 and only removes empty spots', async () => {
    const id = await makeOuting(t, mike.id, { teeTimeCount: 1, playersEach: 2 });
    const tee = (await getOutingView(deps, id, mike.id))!.teeTimes[0]!;
    await expect(changeCapacity(deps, { playerId: mike.id }, tee.id, -1)).rejects.toMatchObject({
      code: 'conflict',
    });
    await changeCapacity(deps, { playerId: mike.id }, tee.id, 1);
    await changeCapacity(deps, { playerId: mike.id }, tee.id, 1);
    await changeCapacity(deps, { playerId: mike.id }, tee.id, 1);
    await expect(changeCapacity(deps, { playerId: mike.id }, tee.id, 1)).rejects.toMatchObject({
      code: 'conflict',
    });
    let view = (await getOutingView(deps, id, mike.id))!;
    expect(view.teeTimes[0]!.capacity).toBe(5);
    expect(view.teeTimes[0]!.slots).toHaveLength(5);

    await seat(id, 0, 4);
    await changeCapacity(deps, { playerId: mike.id }, tee.id, -1);
    view = (await getOutingView(deps, id, mike.id))!;
    expect(view.teeTimes[0]!.capacity).toBe(4);
    // Mike (slot 1) and Jen (last slot) are still seated.
    expect(view.teeTimes[0]!.slots.filter((s) => !s.open).map((s) => s.name)).toEqual([
      'Mike Golfer',
      'Jen Putts',
    ]);
  });

  it('deletes only empty tee times and never the last one', async () => {
    const id = await makeOuting(t, mike.id, { teeTimeCount: 3 });
    const tee2 = await seat(id, 1, 0);
    const tees = (await getOutingView(deps, id, mike.id))!.teeTimes;
    await expect(deleteTeeTime(deps, { playerId: mike.id }, tee2.id)).rejects.toMatchObject({
      code: 'conflict',
    });
    await expect(deleteTeeTime(deps, { playerId: mike.id }, tees[0]!.id)).rejects.toMatchObject({
      code: 'conflict',
    });
    await deleteTeeTime(deps, { playerId: mike.id }, tees[2]!.id);
    expect((await getOutingView(deps, id, mike.id))!.teeTimes).toHaveLength(2);
  });

  it('removes a player along with their guests', async () => {
    const id = await makeOuting(t, mike.id);
    const tee = await seat(id, 1, 0, 1);
    await removePlayer(deps, { playerId: mike.id }, tee.slots[0]!.id);
    const view = (await getOutingView(deps, id, mike.id))!;
    expect(view.teeTimes[1]!.filled).toBe(0);
    const last = (await events(id)).at(-1)!;
    expect(last.type).toBe('player_removed');
    expect(last.payload).toMatchObject({ playerName: 'Jen Putts', guestCount: 1 });
  });

  it('cannot remove the organizer', async () => {
    const id = await makeOuting(t, mike.id);
    const slot = (await getOutingView(deps, id, mike.id))!.teeTimes[0]!.slots[0]!;
    await expect(removePlayer(deps, { playerId: mike.id }, slot.id)).rejects.toMatchObject({
      code: 'conflict',
    });
  });

  it('only lets the organizer make changes', async () => {
    const id = await makeOuting(t, mike.id);
    const tee = (await getOutingView(deps, id, mike.id))!.teeTimes[0]!;
    await expect(addTeeTime(deps, { playerId: jen.id }, id)).rejects.toMatchObject({ code: 'forbidden' });
    await expect(changeCapacity(deps, { playerId: jen.id }, tee.id, 1)).rejects.toMatchObject({
      code: 'forbidden',
    });
    await expect(setLocked(deps, { playerId: jen.id }, id, true)).rejects.toMatchObject({
      code: 'forbidden',
    });
  });

  it('locking blocks structural changes until unlocked, but details can still change', async () => {
    const id = await makeOuting(t, mike.id);
    await setLocked(deps, { playerId: mike.id }, id, true);
    expect((await getOutingView(deps, id, null))!.locked).toBe(true);
    await expect(addTeeTime(deps, { playerId: mike.id }, id)).rejects.toMatchObject({ code: 'conflict' });
    await updateDetails(deps, { playerId: mike.id }, id, { note: 'Carts today', price: '' });
    await setLocked(deps, { playerId: mike.id }, id, false);
    await addTeeTime(deps, { playerId: mike.id }, id);
    const types = (await events(id)).map((e) => e.type);
    expect(types).toEqual(['outing_created', 'locked', 'outing_updated', 'unlocked', 'tee_time_added']);
    const view = (await getOutingView(deps, id, null))!;
    expect(view.note).toBe('Carts today');
    expect(view.priceCents).toBeNull();
    expect(view.version).toBe(6);
  });
});

describe('delete outing', () => {
  it('only the organizer can delete it, even when locked, and it leaves an audit row', async () => {
    const id = await makeOuting(t, mike.id);
    await seat(id, 1, 0);
    await setLocked(deps, { playerId: mike.id }, id, true);
    await expect(deleteOuting(deps, { playerId: jen.id }, id)).rejects.toMatchObject({ code: 'forbidden' });

    await deleteOuting(deps, { playerId: mike.id }, id);
    expect(await getOutingView(deps, id, mike.id)).toBeNull();
    expect(await events(id)).toEqual([]);
    expect((await listUpcomingOutings(deps, jen.id)).map((o) => o.id)).not.toContain(id);
    const [row] = await t.asOwner(() =>
      t.db
        .select()
        .from(auditLog)
        .where(and(eq(auditLog.target, `outing:${id}`), eq(auditLog.action, 'outing.deleted'))),
    );
    expect(row).toMatchObject({ action: 'outing.deleted', meta: { spotsTaken: 2 } });

    await expect(deleteOuting(deps, { playerId: mike.id }, id)).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('tenant isolation for outing data', () => {
  it("another tenant can't see an outing or its tee sheet", async () => {
    const id = await makeOuting(t, mike.id);
    const [other] = await t.asOwner(() =>
      t.db
        .insert(tenants)
        .values({ slug: `other-${Date.now()}`, name: 'Other' })
        .returning(),
    );
    const otherDeps = { db: t.db, tenantId: other!.id };
    expect(await getOutingView(otherDeps, id, null)).toBeNull();
    const leaked = await withTenant(t.db, other!.id, (tx) =>
      tx.select().from(slots).where(eq(slots.outingId, id)),
    );
    expect(leaked).toEqual([]);
  });
});
