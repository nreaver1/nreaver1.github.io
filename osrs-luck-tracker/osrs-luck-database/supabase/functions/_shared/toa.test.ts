import { assert, assertAlmostEquals, assertEquals } from "jsr:@std/assert@1";
import {
  chanceByRaid,
  jewelChance,
  jewelChanceAnyOrder,
  petChance,
  petLevel,
  purpleItemChance,
  purpleLevel,
  purplesMidP,
  purpleSummary,
  purpleWeights,
  raidSequence,
  threadChance,
  TOA,
  TOA_JEWELS,
  TOA_PET,
  TOA_THREAD,
  uniqueChance,
  type ToaRaid,
} from "./toa.ts";
import type { RaidCompletion } from "./raids.ts";

const FANG = 26219;
const LIGHTBEARER = 25975;
const WARD = 25985;
const SHADOW = 27277;
const JEWEL_OF_AMASCUT = 30893;

const raid = (over: Partial<ToaRaid> = {}): ToaRaid => ({
  mode: "normal",
  raid_level: 300,
  team_size: 1,
  personal_points: 20_000,
  tracked: true,
  ...over,
});

const completion = (over: Partial<RaidCompletion> = {}): RaidCompletion => ({
  raid: TOA,
  mode: "expert",
  mode_kc: 1,
  total_kc: 1,
  mode_counts: { expert: 1 },
  team_size: 1,
  personal_points: 20_000,
  purple: false,
  purple_mine: false,
  details: { raid_level: 300 },
  completed_at: "2026-11-11T00:00:00Z",
  ...over,
});

Deno.test("purpleLevel matches the wiki's level 400 example (1% per 3,700 points)", () => {
  assertEquals(purpleLevel(300), 300);
  assertEquals(purpleLevel(400), 340);
  assertEquals(10_500 - 20 * purpleLevel(400), 3_700);
  // Above 430 a sixth counts: 430 -> 350, 490 -> 360.
  assertEquals(purpleLevel(430), 350);
  assertEquals(purpleLevel(490), 360);
  assertEquals(purpleLevel(600), purpleLevel(550));
});

Deno.test("petLevel scales above 400 and stops at 550 (wiki: 450 max)", () => {
  assertEquals(petLevel(400), 400);
  assertEquals(petLevel(550), 450);
  assertEquals(petLevel(600), 450);
});

Deno.test("purple weights match the wiki's table", () => {
  const ratio = (rl: number, id: number) => {
    const w = purpleWeights(rl);
    return [...w.values()].reduce((a, b) => a + b, 0) / w.get(id)!;
  };
  assertAlmostEquals(ratio(300, FANG), 3.43, 0.01);
  assertAlmostEquals(ratio(300, WARD), 8, 1e-9);
  assertAlmostEquals(ratio(300, SHADOW), 24, 1e-9);
  assertAlmostEquals(ratio(400, FANG), 4.75, 1e-9);
  assertAlmostEquals(ratio(400, LIGHTBEARER), 3.8, 1e-9);
  assertAlmostEquals(ratio(500, FANG), 5.5, 1e-9);
  assertAlmostEquals(ratio(500, LIGHTBEARER), 4.71, 0.01);
  assertAlmostEquals(ratio(500, SHADOW), 16.5, 1e-9);
});

Deno.test("uniqueChance: a 20k-point solo at 300 is the wiki guide's ~1/22.5", () => {
  assertAlmostEquals(uniqueChance(raid()), 1 / 22.5, 1e-9);
});

Deno.test("uniqueChance: below the cap, team size doesn't change a player's own chance", () => {
  assertAlmostEquals(uniqueChance(raid({ team_size: 3 })), uniqueChance(raid()), 1e-12);
});

Deno.test("uniqueChance: the 55% team cap splits between the team", () => {
  // 8 x 59,000 points at 500 is well over 55% for the team.
  assertAlmostEquals(uniqueChance(raid({ raid_level: 500, team_size: 8, personal_points: 59_000 })), 0.55 / 8, 1e-12);
});

Deno.test("purpleItemChance: out-of-level items need the extra 1/50", () => {
  const atEntry = purpleItemChance(SHADOW, raid({ raid_level: 100 }));
  const share = uniqueChance(raid({ raid_level: 100 })) * (10 / 240);
  assertAlmostEquals(atEntry, share / 50, 1e-12);
  // Fang is in level from 50.
  assertAlmostEquals(purpleItemChance(FANG, raid({ raid_level: 100 })), uniqueChance(raid({ raid_level: 100 })) * 70 / 240, 1e-12);
  assertAlmostEquals(purpleItemChance(FANG, raid({ raid_level: 40 })), uniqueChance(raid({ raid_level: 40 })) * 70 / 240 / 50, 1e-12);
});

Deno.test("petChance: 1% per 245,000 points at 150", () => {
  assertAlmostEquals(petChance(raid({ raid_level: 150, personal_points: 24_500 })), 0.001, 1e-12);
});

Deno.test("jewelChance: 1/50 rising to 3/50, with duplicate protection", () => {
  assertAlmostEquals(jewelChance(0, 0), 1 / 50, 1e-12);
  assertAlmostEquals(jewelChance(75, 0), 3 / 50, 1e-12);
  assertAlmostEquals(jewelChance(200, 0), 3 / 50, 1e-12);
  assertAlmostEquals(jewelChance(0, 1), 1 / 37.5, 1e-12);
  assertAlmostEquals(jewelChance(0, 2), 1 / 25, 1e-12);
  assertAlmostEquals(jewelChance(0, 3), 1 / 12.5, 1e-12);
});

Deno.test("threadChance: 1/10 rising to 3/10 at 15 raids", () => {
  assertAlmostEquals(threadChance(0), 0.1, 1e-12);
  assertAlmostEquals(threadChance(15), 0.3, 1e-12);
  assertAlmostEquals(threadChance(40), 0.3, 1e-12);
});

Deno.test("chanceByRaid: a first jewel over 21 raids matches the old streak calculation", () => {
  const raids = Array.from({ length: 21 }, () => raid());
  assertAlmostEquals(chanceByRaid(JEWEL_OF_AMASCUT, raids), 0.4166511851848237, 1e-12);
});

Deno.test("chanceByRaid: another jewel resets pity and adds duplicate protection", () => {
  const raids = Array.from({ length: 10 }, () => raid());
  // Breach came on raid 5: raids 6-10 roll with pity reset and 1 owned.
  let survival = 1;
  for (let i = 0; i < 5; i++) survival *= 1 - jewelChance(i, 0);
  for (let i = 0; i < 5; i++) survival *= 1 - jewelChance(i, 1);
  assertAlmostEquals(chanceByRaid(JEWEL_OF_AMASCUT, raids, [5]), 1 - survival, 1e-12);
  assertEquals(TOA_JEWELS.includes(JEWEL_OF_AMASCUT), true);
});

Deno.test("chanceByRaid: thread and pet", () => {
  assertAlmostEquals(chanceByRaid(TOA_THREAD, [raid()]), 0.1, 1e-12);
  assertAlmostEquals(chanceByRaid(TOA_PET, [raid()]), petChance(raid()), 1e-12);
  assertEquals(Number.isNaN(chanceByRaid(123, [raid()])), true);
});

Deno.test("raidSequence: recorded raids sit at their total, the rest fill by mode", () => {
  const seq = raidSequence(4, [completion({ total_kc: 3, mode_counts: { entry: 1, normal: 1, expert: 1 } })], {
    entry: 1,
    normal: 2,
    expert: 1,
  });
  assertEquals(seq.length, 4);
  assertEquals(seq[2].tracked, true);
  assertEquals(seq.filter((r) => !r.tracked).map((r) => r.mode).sort(), ["entry", "normal", "normal"]);
  // Raids beyond the total are ignored, and missing counts default to normal.
  const short = raidSequence(2, [completion({ total_kc: 5 })], {});
  assertEquals(short.map((r) => [r.mode, r.tracked]), [["normal", false], ["normal", false]]);
});

Deno.test("purplesMidP", () => {
  assertAlmostEquals(purplesMidP([], 0), 0.5, 1e-12);
  assertAlmostEquals(purplesMidP([0.5], 1), 0.25, 1e-12);
  assertAlmostEquals(purplesMidP([0.5], 0), 0.75, 1e-12);
  assertAlmostEquals(purplesMidP([0.5, 0.5], 1), 0.25 + 0.25, 1e-12);
});

Deno.test("purpleSummary counts only raids with a known result", () => {
  const s = purpleSummary([
    completion({ purple_mine: true, purple: true }),
    completion({ total_kc: 2 }),
    completion({ total_kc: 3, purple: null, purple_mine: null }),
  ]);
  assertEquals(s.raids, 2);
  assertEquals(s.purples, 1);
  assertAlmostEquals(s.expected, 2 / 22.5, 1e-9);
});

Deno.test("jewelChanceAnyOrder: exact for the first raids", () => {
  assertEquals(jewelChanceAnyOrder(0), 0);
  // One raid: 4/50 for some jewel, a quarter of that for this one.
  assertAlmostEquals(jewelChanceAnyOrder(1), 1 / 50, 1e-12);
  // Two raids: a jewel on raid 1 (then raid 2 at base rate), or on raid 2 after one dry raid.
  const hit0 = 4 / 50, hit1 = (4 / 50) * (1 + 2 / 75);
  const owned = hit0 * (1 + hit0) + (1 - hit0) * hit1;
  assertAlmostEquals(jewelChanceAnyOrder(2), owned / 4, 1e-12);
});

Deno.test("jewelChanceAnyOrder matches a simulation of pity and duplicate protection", () => {
  // mulberry32, seeded so the test is deterministic.
  let seed = 12345;
  const rand = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const trials = 200_000;
  for (const raids of [26, 120]) {
    let hasEye = 0;
    for (let t = 0; t < trials; t++) {
      const missing = [0, 1, 2, 3];
      let dry = 0;
      for (let r = 0; r < raids && missing.length; r++) {
        if (rand() < (4 / 50) * (1 + (2 * Math.min(dry, 75)) / 75)) {
          missing.splice(Math.floor(rand() * missing.length), 1);
          dry = 0;
        } else dry++;
      }
      if (!missing.includes(1)) hasEye++;
    }
    assertAlmostEquals(jewelChanceAnyOrder(raids), hasEye / trials, 0.005);
  }
});

Deno.test("chanceByRaid: an unknown jewel count rates over every order", () => {
  const raids = Array.from({ length: 26 }, () => raid());
  assertAlmostEquals(chanceByRaid(JEWEL_OF_AMASCUT, raids, [null, 26]), jewelChanceAnyOrder(26), 1e-12);
  // All counts known: still raid by raid.
  assert(chanceByRaid(JEWEL_OF_AMASCUT, raids, [5]) !== jewelChanceAnyOrder(26));
});
