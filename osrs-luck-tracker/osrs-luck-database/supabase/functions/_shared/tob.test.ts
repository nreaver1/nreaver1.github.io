import { assert, assertAlmostEquals, assertEquals } from "jsr:@std/assert@1";
import {
  chanceByRaid,
  itemChance,
  raidSequence,
  TOB,
  TOB_DUST,
  TOB_HOLY_KIT,
  TOB_PET,
  TOB_PURPLES,
  tobRaidOf,
  uniqueChance,
  UNTRACKED_TEAM_SIZE,
  type TobRaid,
} from "./tob.ts";
import type { RaidCompletion } from "./raids.ts";

const SCYTHE = 22486;
const HILT = 22477;

const raid = (over: Partial<TobRaid> = {}): TobRaid => ({ mode: "normal", team_size: 4, tracked: true, ...over });

Deno.test("uniqueChance: 1/9.1 or 1/7.7 for the team, split evenly; none in Entry Mode", () => {
  assertAlmostEquals(uniqueChance(raid()), 1 / 9.1 / 4, 1e-12);
  assertAlmostEquals(uniqueChance(raid({ mode: "hard", team_size: 2 })), 1 / 7.7 / 2, 1e-12);
  assertEquals(uniqueChance(raid({ mode: "entry" })), 0);
});

Deno.test("itemChance: weights by mode, pet per player, Hard Mode tertiaries", () => {
  assertAlmostEquals(itemChance(SCYTHE, raid()), (1 / 9.1 / 4) / 19, 1e-12);
  assertAlmostEquals(itemChance(HILT, raid({ mode: "hard" })), (1 / 7.7 / 4) * (7 / 18), 1e-12);
  assertEquals(itemChance(TOB_PET, raid()), 1 / 650);
  assertEquals(itemChance(TOB_PET, raid({ mode: "hard" })), 1 / 500);
  assertEquals(itemChance(TOB_PET, raid({ mode: "entry" })), 0);
  assertEquals(itemChance(TOB_HOLY_KIT, raid()), 0);
  assertEquals(itemChance(TOB_DUST, raid({ mode: "hard" })), 1 / 275);
  assert(Number.isNaN(itemChance(22446, raid()))); // vial of blood: a flat rate
  const sum = TOB_PURPLES.reduce((s, id) => s + itemChance(id, raid({ mode: "hard" })), 0);
  assertAlmostEquals(sum, uniqueChance(raid({ mode: "hard" })), 1e-12);
});

Deno.test("raidSequence: recorded team size, four assumed otherwise", () => {
  const recorded: RaidCompletion = {
    raid: TOB,
    mode: "hard",
    mode_kc: 1,
    total_kc: 3,
    mode_counts: { entry: 1, normal: 1, hard: 1 },
    team_size: 5,
    personal_points: null,
    purple: null,
    purple_mine: null,
    details: {},
    completed_at: "2026-11-12T00:00:00Z",
  };
  assertEquals(tobRaidOf({ ...recorded, team_size: null }).team_size, UNTRACKED_TEAM_SIZE);
  const seq = raidSequence(3, [recorded], { entry: 1, normal: 1, hard: 1 });
  assertEquals(seq.map((r) => [r.mode, r.team_size]), [["entry", 4], ["normal", 4], ["hard", 5]]);
  assertAlmostEquals(chanceByRaid(TOB_PET, seq), 1 - (649 / 650) * (499 / 500), 1e-12);
  assertEquals(chanceByRaid(TOB_HOLY_KIT, raidSequence(10, [], { normal: 10 })), 0);
});
