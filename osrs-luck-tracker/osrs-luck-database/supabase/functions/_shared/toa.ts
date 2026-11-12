// Tombs of Amascut drop chances, raid by raid. Transcribed from the OSRS
// Wiki's "Chest (Tombs of Amascut)" and "Jewel of Amascut" pages
// (2026-11-11), with the purple weights' raid-level interpolation taken
// from LlemonDuck's Tombs of Amascut plugin, which matches the wiki's
// weight table at every level it lists.
//
// A raid's chance for an item depends on what the plugin recorded for it
// (raid_completions, migration 0011): raid level, team size and the
// player's points. Raids from before tracking started, or a field the
// plugin couldn't read, fall back to UNTRACKED_DEFAULTS for that mode.
//
//  - Purples: the team has 1% per (10,500 - 20 x RL) points, RL scaled
//    down above 310, capped at 55%. One player gets it, picked by share of
//    points, so below the cap a player's own chance is their points over
//    the same divisor whatever the team scored. The client only learns
//    the player's own points, so the cap check assumes an even split.
//    The item is then picked by weight; one outside its raid level
//    (fang and Lightbearer below 50, the rest below 150) needs an
//    extra 1/50 roll.
//  - Pet: 1% per (350,000 - 700 x RL) points, RL scaled above 400, no cap.
//  - Jewels: 1/50 each, 4/50 for any, rising linearly to 3x at 75 raids
//    without one. Pity counts raids in every mode (the wiki says only
//    "each raid completed"). Duplicate protection: a jewel roll gives one
//    the player doesn't own, so with k owned each missing one is (4/50)/(4-k).
//    When another jewel's completion count is unknown (logged before
//    tracking), the chance is a fair player's over every possible order
//    instead (jewelChanceAnyOrder), since pity and protection depend on
//    when the others came.
//  - Thread of Elidinis (first one): 1/10 rising to 3/10 at 15 raids.

import { raidSequenceOf, type ModeCounts, type RaidCompletion } from "./raids.ts";

export const TOA = "Tombs of Amascut";

const FANG = 26219;
const LIGHTBEARER = 25975;
const WARD = 25985;
const MASORI_MASK = 27226;
const MASORI_BODY = 27229;
const MASORI_CHAPS = 27232;
const SHADOW = 27277;
export const TOA_PET = 27352;
export const TOA_THREAD = 27279;
export const TOA_JEWELS = [27283, 27285, 27289, 30893]; // Breach, Eye, Sun, Amascut
export const TOA_PURPLES = [FANG, LIGHTBEARER, WARD, MASORI_MASK, MASORI_BODY, MASORI_CHAPS, SHADOW];

export const TOA_ITEMS = [...TOA_PURPLES, TOA_PET, TOA_THREAD, ...TOA_JEWELS];

/** A raid as the chance calculation sees it: recorded, or assumed for its mode. */
export interface ToaRaid {
  mode: string;
  raid_level: number;
  team_size: number;
  personal_points: number;
  tracked: boolean;
}

// Assumptions for raids the plugin didn't record: a deathless solo with
// ~20,000 points at the bottom of the mode's level band. 20,000 at level
// 300 gives the wiki money making guide's ~1/22.5 purple rate.
export const UNTRACKED_DEFAULTS: Record<string, Omit<ToaRaid, "mode" | "tracked">> = {
  entry: { raid_level: 100, team_size: 1, personal_points: 20_000 },
  normal: { raid_level: 150, team_size: 1, personal_points: 20_000 },
  expert: { raid_level: 300, team_size: 1, personal_points: 20_000 },
};

const MAX_UNIQUE_CHANCE = 0.55;

/** The raid level the purple formula uses: full to 310, a third to 430, a sixth above, capped at 550. */
export function purpleLevel(raidLevel: number): number {
  let rl = Math.min(550, raidLevel);
  if (rl > 310) {
    if (rl > 430) rl = 430 + Math.floor((rl - 430) / 2);
    rl = 310 + Math.floor((rl - 310) / 3);
  }
  return rl;
}

/** The raid level the pet formula uses: full to 400, a third above, capped at 550. */
export function petLevel(raidLevel: number): number {
  const rl = Math.min(550, raidLevel);
  return rl > 400 ? 400 + Math.floor((rl - 400) / 3) : rl;
}

/** This player's chance of a purple from the raid. */
export function uniqueChance(raid: Pick<ToaRaid, "raid_level" | "team_size" | "personal_points">): number {
  const perPercent = 10_500 - 20 * purpleLevel(raid.raid_level);
  const team = Math.max(1, raid.team_size);
  // Team chance with an even split assumed, then this player's share of it.
  const teamChance = Math.min(MAX_UNIQUE_CHANCE, (raid.personal_points * team) / perPercent / 100);
  return teamChance / team;
}

export function petChance(raid: Pick<ToaRaid, "raid_level" | "personal_points">): number {
  const perPercent = 350_000 - 700 * petLevel(raid.raid_level);
  return Math.min(1, raid.personal_points / perPercent / 100);
}

const lerp = (rl: number, from: number, to: number, range: number) =>
  rl <= from ? 0 : rl >= to ? range : Math.floor((range * (rl - from)) / (to - from));

/** Purple weights at a raid level (the wiki's 150-300 table: 70/70/30/20/20/20/10). */
export function purpleWeights(raidLevel: number): Map<number, number> {
  const rl = raidLevel;
  return new Map([
    [FANG, 70 - lerp(rl, 450, 500, 10) - lerp(rl, 350, 400, 20) - lerp(rl, 300, 350, 10)],
    [LIGHTBEARER, 70 - lerp(rl, 450, 500, 5) - lerp(rl, 300, 450, 30)],
    [WARD, 30],
    [MASORI_MASK, 20],
    [MASORI_BODY, 20],
    [MASORI_CHAPS, 20],
    [SHADOW, 10],
  ]);
}

/** Whether an item is outside its raid level, so it needs the extra 1/50 roll. */
function belowItemLevel(itemId: number, raidLevel: number): boolean {
  return itemId === FANG || itemId === LIGHTBEARER ? raidLevel < 50 : raidLevel < 150;
}

/** This player's chance of one particular purple from the raid. */
export function purpleItemChance(itemId: number, raid: ToaRaid): number {
  const weights = purpleWeights(raid.raid_level);
  const weight = weights.get(itemId);
  if (weight === undefined) return 0;
  const total = [...weights.values()].reduce((a, b) => a + b, 0);
  const levelRoll = belowItemLevel(itemId, raid.raid_level) ? 1 / 50 : 1;
  return uniqueChance(raid) * (weight / total) * levelRoll;
}

/** A specific missing jewel's chance after `dry` raids without any jewel, owning `owned` of the four. */
export function jewelChance(dry: number, owned: number): number {
  const anyJewel = (4 / 50) * (1 + (2 * Math.min(dry, 75)) / 75);
  return Math.min(1, anyJewel / Math.max(1, 4 - owned));
}

/**
 * The chance a fair player owns one particular jewel after `raids`
 * completions, with nothing known about when any jewel came. Tracks the
 * spread of (jewels so far, raids since the last one) raid by raid: each
 * jewel roll gives a new jewel and resets pity, and the four come in a
 * random order, so the answer is E[jewels owned] / 4.
 */
export function jewelChanceAnyOrder(raids: number): number {
  const MAX_DRY = 75;
  // dist[j][d]: chance of j jewels with d raids since the last (d capped).
  let dist = Array.from({ length: 4 }, () => new Array<number>(MAX_DRY + 1).fill(0));
  dist[0][0] = 1;
  let all = 0; // chance of owning all four
  for (let r = 0; r < raids; r++) {
    const next = Array.from({ length: 4 }, () => new Array<number>(MAX_DRY + 1).fill(0));
    for (let j = 0; j < 4; j++) {
      for (let d = 0; d <= MAX_DRY; d++) {
        const p = dist[j][d];
        if (p === 0) continue;
        const hit = (4 / 50) * (1 + (2 * d) / MAX_DRY);
        if (j === 3) all += p * hit;
        else next[j + 1][0] += p * hit;
        next[j][Math.min(d + 1, MAX_DRY)] += p * (1 - hit);
      }
    }
    dist = next;
  }
  let owned = 4 * all;
  for (let j = 1; j < 4; j++) owned += j * dist[j].reduce((a, b) => a + b, 0);
  return owned / 4;
}

/** The first thread's chance on a raid after `before` raids. */
export function threadChance(before: number): number {
  return 0.1 + 0.2 * Math.min(before, 15) / 15;
}

/** Raids 1..total in order, recorded or assumed per UNTRACKED_DEFAULTS (raids.ts raidSequenceOf). */
export function raidSequence(total: number, recorded: RaidCompletion[], countsAtEnd: ModeCounts): ToaRaid[] {
  return raidSequenceOf(TOA, total, recorded, countsAtEnd, toaRaidOf, (mode) => ({
    mode,
    ...(UNTRACKED_DEFAULTS[mode] ?? UNTRACKED_DEFAULTS.normal),
    tracked: false,
  }));
}

/** A recorded completion as the chance calculation sees it, defaults filling what the plugin couldn't read. */
export function toaRaidOf(r: RaidCompletion): ToaRaid {
  const defaults = UNTRACKED_DEFAULTS[r.mode] ?? UNTRACKED_DEFAULTS.normal;
  const level = r.details?.raid_level;
  return {
    mode: r.mode,
    raid_level: typeof level === "number" ? level : defaults.raid_level,
    team_size: r.team_size ?? defaults.team_size,
    personal_points: r.personal_points ?? defaults.personal_points,
    tracked: true,
  };
}

/**
 * The chance a fair player would have had `itemId` by the end of `raids`
 * (raid 1 first). `jewelKcs` holds the total completion count each of the
 * player's other jewels came on, null for one whose count isn't known.
 */
export function chanceByRaid(itemId: number, raids: ToaRaid[], jewelKcs: (number | null)[] = []): number {
  let survival = 1;
  if (TOA_JEWELS.includes(itemId) && jewelKcs.some((kc) => kc === null)) {
    return jewelChanceAnyOrder(raids.length);
  }
  if (TOA_JEWELS.includes(itemId)) {
    const others = (jewelKcs as number[]).slice().sort((a, b) => a - b);
    raids.forEach((_, i) => {
      const raidNumber = i + 1;
      const before = others.filter((kc) => kc < raidNumber);
      const lastJewel = before.length ? before[before.length - 1] : 0;
      survival *= 1 - jewelChance(raidNumber - 1 - lastJewel, before.length);
    });
  } else if (itemId === TOA_THREAD) {
    raids.forEach((_, i) => (survival *= 1 - threadChance(i)));
  } else if (itemId === TOA_PET) {
    for (const r of raids) survival *= 1 - petChance(r);
  } else if (TOA_PURPLES.includes(itemId)) {
    for (const r of raids) survival *= 1 - purpleItemChance(itemId, r);
  } else {
    return NaN;
  }
  return 1 - survival;
}

/**
 * Mid-p of `observed` purples over raids with these chances: P(more) plus
 * half P(exactly as many) under a fair-luck Poisson binomial. Low means
 * more purples than most players would have had.
 */
export function purplesMidP(chances: number[], observed: number): number {
  // pmf[k] for k = 0..observed, with everything above folded into "more".
  let pmf = new Array(observed + 1).fill(0);
  pmf[0] = 1;
  for (const p of chances) {
    const next = new Array(observed + 1).fill(0);
    for (let k = 0; k <= observed; k++) {
      next[k] += pmf[k] * (1 - p);
      if (k + 1 <= observed) next[k + 1] += pmf[k] * p;
    }
    pmf = next;
  }
  const atMost = pmf.reduce((a, b) => a + b, 0);
  return Math.min(1, Math.max(0, 1 - atMost + pmf[observed] / 2));
}

/** Purples over the raids the plugin recorded (those whose result it saw). */
export function purpleSummary(recorded: RaidCompletion[]) {
  const seen = recorded.filter((r) => r.raid === TOA && r.purple_mine !== null);
  const chances = seen.map((r) => uniqueChance(toaRaidOf(r)));
  const purples = seen.filter((r) => r.purple_mine).length;
  return {
    raids: seen.length,
    purples,
    expected: chances.reduce((a, b) => a + b, 0),
    probability: seen.length > 0 ? purplesMidP(chances, purples) : NaN,
  };
}
