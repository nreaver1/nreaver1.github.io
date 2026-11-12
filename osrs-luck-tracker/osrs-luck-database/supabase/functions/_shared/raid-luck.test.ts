import { assert, assertAlmostEquals, assertEquals } from "jsr:@std/assert@1";
import { countsAtDrop, latestCounts, raidDropLuck, raidHunting, raidSummaries, type RaidHistory } from "./raid-luck.ts";
import { parseRaidRecord, raidModeForKcName, raidRow, type RaidCompletion } from "./raids.ts";
import { chanceByRaid, jewelChanceAnyOrder, raidSequence, TOA, TOA_THREAD } from "./toa.ts";
import type { CollectionLogDrop, DropRate } from "./types.ts";

const JEWEL_OF_AMASCUT = 30893;
const BREACH = 27283;
const FANG = 26219;

const drop = (over: Partial<CollectionLogDrop> = {}): CollectionLogDrop => ({
  id: "d",
  account_hash: "a",
  item_id: JEWEL_OF_AMASCUT,
  source_name: TOA,
  kc_received: 26,
  kc_at_previous_drop: 26,
  roll_context: { mode: "normal", mode_counts: { entry: 5, normal: 21, expert: 0 } },
  date_received: null,
  date_submitted: "2026-11-11T00:00:00Z",
  is_backfilled: false,
  ...over,
});

const completion = (over: Partial<RaidCompletion> = {}): RaidCompletion => ({
  raid: TOA,
  mode: "expert",
  mode_kc: 1,
  total_kc: 1,
  mode_counts: { entry: 0, normal: 0, expert: 1 },
  team_size: 1,
  personal_points: 20_000,
  purple: false,
  purple_mine: false,
  details: { raid_level: 300 },
  completed_at: "2026-11-11T00:00:00Z",
  ...over,
});

const rate = (itemId: number): DropRate => ({
  item_id: itemId,
  source_name: TOA,
  distribution_type: "streak_adjusted",
  denominator: 50,
  numerator: 1,
  rolls_per_kill: 1,
  metadata: { raid_model: "toa" },
  source_updated_at: "",
});

const empty: RaidHistory = { raids: [], drops: [] };

Deno.test("countsAtDrop: stored counts, then the recorded raid, then the sent mode", () => {
  assertEquals(countsAtDrop(drop(), empty), { entry: 5, normal: 21, expert: 0 });
  const raid = completion({ total_kc: 26, mode_counts: { entry: 4, normal: 0, expert: 22 } });
  assertEquals(countsAtDrop(drop({ roll_context: null }), { raids: [raid], drops: [] }), raid.mode_counts);
  assertEquals(countsAtDrop(drop({ roll_context: { mode: "expert" }, kc_received: 3 }), empty), { expert: 3 });
});

Deno.test("raidDropLuck: a jewel on raid 26 with no recorded raids", () => {
  const r = raidDropLuck(drop(), empty);
  assertEquals(r.supported, true);
  assertEquals(r.estimated, true);
  assertAlmostEquals(r.probability, chanceByRaid(JEWEL_OF_AMASCUT, raidSequence(26, [], { normal: 26 })), 1e-12);
});

Deno.test("raidDropLuck: another jewel's drop gives duplicate protection", () => {
  const breach = drop({ id: "b", item_id: BREACH, kc_received: 10 });
  const alone = raidDropLuck(drop(), empty).probability;
  const withBreach = raidDropLuck(drop(), { raids: [], drops: [breach] }).probability;
  assert(withBreach !== alone);
});

Deno.test("latestCounts tops the newest raid up to the page read", () => {
  const history = { raids: [completion({ total_kc: 3, mode_counts: { entry: 1, normal: 1, expert: 1 } })], drops: [] };
  assertEquals(latestCounts(TOA, history, 5), { entry: 1, normal: 3, expert: 1 });
  assertEquals(latestCounts(TOA, empty, 4), { normal: 4 });
});

Deno.test("raidHunting rates missing items and skips obtained or recorded ones", () => {
  const rates = new Map([JEWEL_OF_AMASCUT, BREACH, TOA_THREAD, FANG].map((id) => [`${id}::${TOA}`, rate(id)]));
  const history: RaidHistory = {
    raids: [completion({ total_kc: 10, mode_counts: { entry: 2, normal: 4, expert: 4 } })],
    drops: [drop({ item_id: BREACH, kc_received: 4, roll_context: null })],
  };
  const rows = raidHunting({ source_name: TOA, kc: 10, obtained: [TOA_THREAD] }, rates, history);
  assertEquals(rows.map((r) => r.item_id).sort(), [FANG, JEWEL_OF_AMASCUT].sort());
  assertEquals(rows[0].kc, 10);
  assertEquals(rows[0].modes?.map((m) => m.kc), [2, 4, 4]);
  assertEquals(raidHunting({ source_name: "Zulrah", kc: 10, obtained: [] }, rates, history), []);
});

Deno.test("raidSummaries: nothing without recorded raids", () => {
  assertEquals(raidSummaries(empty, new Map([[TOA, 30]])), []);
  const s = raidSummaries({ raids: [completion({ purple: true, purple_mine: true })], drops: [] }, new Map([[TOA, 30]]));
  assertEquals(s.length, 1);
  assertEquals(s[0].total, 30);
  assertEquals(s[0].purples, 1);
  assertAlmostEquals(s[0].last_raid!.unique_chance!, 1 / 22.5, 1e-9);
  assert(s[0].probability! < 0.1);
});

Deno.test("raidModeForKcName", () => {
  assertEquals(raidModeForKcName("Tombs of Amascut"), { raid: TOA, mode: "normal" });
  assertEquals(raidModeForKcName("Tombs of Amascut: Expert Mode"), { raid: TOA, mode: "expert" });
  assertEquals(raidModeForKcName("Tombs of Amascut: Entry Mode"), { raid: TOA, mode: "entry" });
  assertEquals(raidModeForKcName("Zulrah"), null);
});

Deno.test("parseRaidRecord validates and fills defaults", () => {
  const ok = parseRaidRecord({
    raid: TOA,
    mode: "expert",
    mode_counts: { entry: 5, normal: 21, expert: 1 },
    team_size: 2,
    personal_points: 18_000,
    purple: true,
    purple_mine: false,
    details: { raid_level: 310, extra: "dropped" },
  });
  if (typeof ok === "string") throw new Error(ok);
  assertEquals(ok.details, { raid_level: 310 });
  const row = raidRow("a", ok);
  assertEquals([row.mode_kc, row.total_kc], [1, 27]);

  const bad = (over: Record<string, unknown>) =>
    typeof parseRaidRecord({ raid: TOA, mode: "normal", mode_counts: { normal: 1 }, ...over }) === "string";
  assertEquals(bad({}), false);
  assertEquals(bad({ raid: "Zulrah" }), true);
  assertEquals(bad({ mode: "hard" }), true);
  assertEquals(bad({ mode_counts: { normal: 0 } }), true);
  assertEquals(bad({ mode_counts: { normal: 1, hard: 2 } }), true);
  assertEquals(bad({ team_size: 9 }), true);
  assertEquals(bad({ personal_points: 70_000 }), true);
  assertEquals(bad({ purple: false, purple_mine: true }), true);
  assertEquals(bad({ details: { raid_level: 700 } }), true);
  assertEquals(bad({ completed_at: "2020-01-01T00:00:00Z" }), true);
});

Deno.test("raidHunting: jewels from the log import rate over every order", () => {
  const EYE = 27285, SUN = 27289;
  const rates = new Map([EYE].map((id) => [`${id}::${TOA}`, rate(id)]));
  const history: RaidHistory = {
    raids: [],
    drops: [
      drop({ id: "b", item_id: BREACH, kc_received: null, is_backfilled: true, roll_context: null }),
      drop({ id: "s", item_id: SUN, kc_received: null, is_backfilled: true, roll_context: null }),
      drop({ id: "a", item_id: JEWEL_OF_AMASCUT, kc_received: 26 }),
    ],
  };
  const [eye] = raidHunting({ source_name: TOA, kc: 26, obtained: [BREACH, SUN, JEWEL_OF_AMASCUT] }, rates, history);
  assertAlmostEquals(eye.probability, jewelChanceAnyOrder(26), 1e-12);
});
