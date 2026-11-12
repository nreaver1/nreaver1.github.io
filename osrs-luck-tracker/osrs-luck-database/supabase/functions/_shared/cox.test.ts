import { assert, assertAlmostEquals, assertEquals } from "jsr:@std/assert@1";
import {
  chanceByRaid,
  COX,
  COX_DUST,
  COX_KIT,
  COX_PET,
  COX_PURPLES,
  coxRaidOf,
  itemChance,
  pointShare,
  raidSequence,
  uniqueChance,
  uniqueRolls,
  type CoxRaid,
} from "./cox.ts";
import type { RaidCompletion } from "./raids.ts";

const TBOW = 20997;
const DEX = 21034;

const raid = (over: Partial<CoxRaid> = {}): CoxRaid => ({
  mode: "normal",
  team_points: 30_000,
  personal_points: 30_000,
  team_size: 1,
  tracked: true,
  ...over,
});

const completion = (over: Partial<RaidCompletion> = {}): RaidCompletion => ({
  raid: COX,
  mode: "normal",
  mode_kc: 1,
  total_kc: 1,
  mode_counts: { normal: 1, challenge: 0 },
  team_size: 3,
  personal_points: 40_000,
  purple: null,
  purple_mine: null,
  details: { total_points: 100_000 },
  completed_at: "2026-11-12T00:00:00Z",
  ...over,
});

Deno.test("uniqueRolls: 1% per 8,676 points, 65.7% per 570,000, up to six", () => {
  assertEquals(uniqueRolls(0), []);
  assertAlmostEquals(uniqueRolls(30_000)[0], 30_000 / 867_600, 1e-12);
  // The wiki's example: 855,000 points is 65.7% then 32.85%.
  const two = uniqueRolls(855_000);
  assertEquals(two.length, 2);
  assertAlmostEquals(two[0], 0.657, 1e-3);
  assertAlmostEquals(two[1], 0.3285, 1e-3);
  assertEquals(uniqueRolls(10_000_000).length, 6);
});

Deno.test("uniqueChance: the team's chance times this player's share of points", () => {
  assertAlmostEquals(uniqueChance(raid()), 30_000 / 867_600, 1e-12);
  // Below the cap, a player's own chance is their points over 867,600 whatever the team did.
  assertAlmostEquals(uniqueChance(raid({ team_points: 120_000, personal_points: 30_000 })), 30_000 / 867_600, 1e-12);
  assertEquals(pointShare(raid({ team_points: 0, personal_points: 0 })), 0);
});

Deno.test("itemChance: weights by mode, pet per unique, CM-only tertiaries", () => {
  const u = uniqueChance(raid());
  assertAlmostEquals(itemChance(TBOW, raid()), u * (2 / 60), 1e-9);
  assertAlmostEquals(itemChance(DEX, raid()), u * (14 / 60), 1e-9);
  assertAlmostEquals(itemChance(DEX, raid({ mode: "challenge" })), u * (12 / 56), 1e-9);
  assertAlmostEquals(itemChance(COX_PET, raid()), u / 53, 1e-9);
  assertEquals(itemChance(COX_DUST, raid()), 0);
  assertEquals(itemChance(COX_DUST, raid({ mode: "challenge" })), 1 / 400);
  assertEquals(itemChance(COX_KIT, raid({ mode: "challenge" })), 1 / 75);
  assert(Number.isNaN(itemChance(21047, raid()))); // torn prayer scroll: a flat rate, not this model's
  // Normal weights add up to 60, so the purples' chances add up to the unique chance.
  const sum = COX_PURPLES.reduce((s, id) => s + itemChance(id, raid()), 0);
  assertAlmostEquals(sum, u, 1e-6);
});

Deno.test("coxRaidOf: the team's total when read, else an even split", () => {
  const r = coxRaidOf(completion());
  assertEquals([r.team_points, r.personal_points, r.team_size], [100_000, 40_000, 3]);
  const noTotal = coxRaidOf(completion({ details: {} }));
  assertEquals(noTotal.team_points, 120_000);
  const nothing = coxRaidOf(completion({ details: {}, personal_points: null, team_size: null, mode: "challenge" }));
  assertEquals([nothing.team_points, nothing.personal_points], [62_000, 62_000]);
});

Deno.test("raidSequence and chanceByRaid: CM dust only counts Challenge Mode raids", () => {
  const seq = raidSequence(5, [completion({ total_kc: 2, mode: "challenge", mode_counts: { normal: 1, challenge: 1 } })], {
    normal: 3,
    challenge: 2,
  });
  assertEquals(seq.map((r) => r.mode), ["normal", "challenge", "normal", "normal", "challenge"]);
  assertEquals(seq.map((r) => r.tracked), [false, true, false, false, false]);
  assertAlmostEquals(chanceByRaid(COX_DUST, seq), 1 - (399 / 400) ** 2, 1e-12);
  const normalOnly = raidSequence(4, [], { normal: 4 });
  assertEquals(chanceByRaid(COX_KIT, normalOnly), 0);
  assertAlmostEquals(chanceByRaid(TBOW, normalOnly), 1 - (1 - itemChance(TBOW, raid({ tracked: false }))) ** 4, 1e-12);
});
