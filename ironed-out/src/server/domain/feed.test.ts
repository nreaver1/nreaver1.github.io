import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import { makeOuting, makePlayer } from '../../../tests/helpers/fixtures';
import { claimAsPlayer, dropOut } from './claims';
import { describeEvent, getFeed, markSeen } from './feed';
import { addTeeTime, getOutingView, setLocked, updateDetails, type OutingsDeps } from './outings';

let t: TestDb;
let deps: OutingsDeps;
let mike: { id: string };
let jen: { id: string };
let dave: { id: string };

beforeAll(async () => {
  t = await createTestDb();
  deps = { db: t.db, tenantId: t.tenantId };
  mike = await makePlayer(t, 'Mike Golfer');
  jen = await makePlayer(t, 'Jen Putts');
  dave = await makePlayer(t, 'Dave Divot');
});
afterAll(async () => {
  await t.pg.close();
});

const view = (id: string, viewer: string | null) => getOutingView(deps, id, viewer).then((v) => v!);
const feedFor = async (id: string, playerId: string | null, anon: string | null = null) =>
  getFeed(deps, await view(id, playerId), playerId ?? `anon:${anon}`, playerId);
const firstOpen = async (id: string, tee: number) =>
  (await view(id, null)).teeTimes[tee]!.slots.find((s) => s.open)!.id;

describe('since you last looked', () => {
  it('shows nothing on a first visit, then the changes since', async () => {
    const id = await makeOuting(t, mike.id);
    await claimAsPlayer(deps, id, jen.id, { slotId: await firstOpen(id, 0) });

    expect((await feedFor(id, jen.id)).hasRecord).toBe(false);
    await markSeen(deps, id, jen.id, (await view(id, jen.id)).lastEventId);
    const quiet = await feedFor(id, jen.id);
    expect(quiet).toMatchObject({ hasRecord: true, items: [] });

    await claimAsPlayer(deps, id, dave.id, { slotId: await firstOpen(id, 1), guests: 1 });
    await dropOut(deps, id, dave.id);
    await addTeeTime(deps, { playerId: mike.id }, id);

    const feed = await feedFor(id, jen.id);
    expect(feed.items.map((i) => i.text)).toEqual([
      'Mike added an 8:10 AM tee time.',
      'Dave Divot dropped out. 2 spots opened at 7:50 AM.',
      'Dave Divot grabbed 7:50 AM and is bringing a guest.',
    ]);
    expect(feed.freshSlotIds).toHaveLength(2);
    const v = await view(id, jen.id);
    expect(feed.newTeeTimeIds).toEqual([v.teeTimes[3]!.id]);
  });

  it("leaves out the viewer's own changes and shows short names to outsiders", async () => {
    const id = await makeOuting(t, mike.id);
    await markSeen(deps, id, mike.id, 0);
    await markSeen(deps, id, 'anon:abc', 0);
    await claimAsPlayer(deps, id, jen.id, { slotId: await firstOpen(id, 0) });
    await setLocked(deps, { playerId: mike.id }, id, true);

    expect((await feedFor(id, mike.id)).items.map((i) => i.text)).toEqual(['Jen Putts grabbed 7:40 AM.']);
    expect((await feedFor(id, null, 'abc')).items.map((i) => i.text)).toEqual([
      'Mike locked it in. The tee sheet is set.',
      'Jen P. grabbed 7:40 AM.',
    ]);
  });

  it('caps the banner at 5 lines and counts the rest', async () => {
    const id = await makeOuting(t, mike.id);
    await markSeen(deps, id, jen.id, 0);
    for (let i = 0; i < 7; i++)
      await updateDetails(deps, { playerId: mike.id }, id, { note: `note ${i}`, price: '' + (40 + i) });
    await addTeeTime(deps, { playerId: mike.id }, id);
    const feed = await feedFor(id, jen.id);
    // Identical lines collapse into one.
    expect(feed.items.map((i) => i.text)).toEqual([
      'Mike added an 8:10 AM tee time.',
      'Mike changed the price and the note.',
    ]);
    expect(feed.more).toBe(0);
  });

  it('never moves the cursor backwards or past the end of the log', async () => {
    const id = await makeOuting(t, mike.id);
    const last = (await view(id, null)).lastEventId;
    await markSeen(deps, id, jen.id, last + 1000);
    await claimAsPlayer(deps, id, dave.id, { slotId: await firstOpen(id, 0) });
    expect((await feedFor(id, jen.id)).items).toHaveLength(1);
    await markSeen(deps, id, jen.id, 0);
    expect((await feedFor(id, jen.id)).items).toHaveLength(1);
  });
});

describe('describeEvent', () => {
  const ctx = { timeZone: 'America/New_York', organizerName: 'Mike Golfer', actorName: null, isMember: true };
  const at = '2026-10-10T11:50:00.000Z';
  it.each([
    [
      { type: 'slot_released', payload: { playerName: 'Dave', startsAt: at, guestCount: 0 } },
      'Dave dropped out. A spot opened at 7:50 AM.',
    ],
    [
      { type: 'player_removed', payload: { playerName: 'Sam', startsAt: at, guestCount: 1 } },
      'Sam is out. 2 spots opened at 7:50 AM.',
    ],
    [
      { type: 'slot_claimed', payload: { playerName: 'Jen', startsAt: at, guestCount: 2 } },
      'Jen grabbed 7:50 AM and is bringing 2 guests.',
    ],
    [{ type: 'capacity_changed', payload: { startsAt: at, from: 4, to: 5 } }, '7:50 AM has room for 5 now.'],
    [{ type: 'capacity_changed', payload: { startsAt: at, from: 4, to: 3 } }, '7:50 AM is down to 3 spots.'],
    [{ type: 'tee_time_removed', payload: { startsAt: at } }, 'The 7:50 AM tee time was dropped.'],
    [{ type: 'outing_created', payload: {} }, null],
  ] as const)('%o', (event, text) => {
    expect(describeEvent({ type: event.type, payload: { ...event.payload } }, ctx)).toBe(text);
  });
});
