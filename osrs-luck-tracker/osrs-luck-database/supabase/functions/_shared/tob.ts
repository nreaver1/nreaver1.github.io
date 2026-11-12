// Theatre of Blood drop chances, raid by raid. Transcribed from the OSRS
// Wiki's "Monumental chest", "Theatre of Blood/Hard Mode", "Theatre of
// Blood/Entry Mode" and "Lil' Zik" pages (2026-11-12).
//
//  - Uniques: a deathless team has 1/9.1 in Normal Mode and 1/7.7 in Hard
//    Mode, whatever its size; deaths lower it, by an amount the wiki
//    doesn't give. One player gets it, weighted by deaths and damage (the
//    MVP most likely), which the client can't see either, so a player's
//    chance is taken as an even share: team chance / team size. Then the
//    item by weight (Normal 19, Hard Mode 18, the hilt weighing less).
//  - Lil' Zik: 1/650 Normal, 1/500 Hard Mode, each player, falling with a
//    poor performance (to a tenth); the best rate is assumed.
//  - Hard Mode only: holy ornament kit 1/100, sanguine ornament kit 1/150,
//    sanguine dust 1/275, each player, also at the best rate.
//  - Entry Mode has no uniques, pet or kits.
//
// Every chance here is an estimate: the plugin records the team size, and
// nothing else that sets these. Raids from before tracking assume a
// deathless four-player team.

import { raidSequenceOf, type ModeCounts, type RaidCompletion } from "./raids.ts";

export const TOB = "Theatre of Blood";

const HILT = 22477;
const RAPIER = 22324;
const SANG = 22481;
const FACEGUARD = 22326;
const CHESTGUARD = 22327;
const LEGGUARDS = 22328;
const SCYTHE = 22486;
export const TOB_PET = 22473;
export const TOB_HOLY_KIT = 25742;
export const TOB_SANGUINE_KIT = 25744;
export const TOB_DUST = 25746;

const WEIGHTS: Record<string, Map<number, number>> = {
  normal: new Map([[HILT, 8], [RAPIER, 2], [SANG, 2], [FACEGUARD, 2], [CHESTGUARD, 2], [LEGGUARDS, 2], [SCYTHE, 1]]),
  hard: new Map([[HILT, 7], [RAPIER, 2], [SANG, 2], [FACEGUARD, 2], [CHESTGUARD, 2], [LEGGUARDS, 2], [SCYTHE, 1]]),
};
const TEAM_UNIQUE: Record<string, number> = { entry: 0, normal: 1 / 9.1, hard: 1 / 7.7 };
const PET: Record<string, number> = { entry: 0, normal: 1 / 650, hard: 1 / 500 };
const HARD_TERTIARY: Record<number, number> = { [TOB_HOLY_KIT]: 1 / 100, [TOB_SANGUINE_KIT]: 1 / 150, [TOB_DUST]: 1 / 275 };

export const TOB_PURPLES = [...WEIGHTS.normal.keys()];
export const TOB_ITEMS = [...TOB_PURPLES, TOB_PET, TOB_HOLY_KIT, TOB_SANGUINE_KIT, TOB_DUST];

export interface TobRaid {
  mode: string;
  team_size: number;
  tracked: boolean;
}

export const UNTRACKED_TEAM_SIZE = 4;

/** This player's chance of a unique from the raid. */
export function uniqueChance(raid: Pick<TobRaid, "mode" | "team_size">): number {
  return (TEAM_UNIQUE[raid.mode] ?? 0) / Math.max(1, raid.team_size);
}

/** This player's chance of `itemId` from one raid; NaN for an item the model doesn't rate. */
export function itemChance(itemId: number, raid: TobRaid): number {
  if (itemId in HARD_TERTIARY) return raid.mode === "hard" ? HARD_TERTIARY[itemId] : 0;
  if (itemId === TOB_PET) return PET[raid.mode] ?? 0;
  const weights = WEIGHTS.normal.has(itemId) ? (WEIGHTS[raid.mode] ?? WEIGHTS.normal) : null;
  if (!weights) return NaN;
  const total = [...weights.values()].reduce((a, b) => a + b, 0);
  return uniqueChance(raid) * (weights.get(itemId)! / total);
}

export function tobRaidOf(r: RaidCompletion): TobRaid {
  return { mode: r.mode, team_size: r.team_size ?? UNTRACKED_TEAM_SIZE, tracked: true };
}

export function raidSequence(total: number, recorded: RaidCompletion[], countsAtEnd: ModeCounts): TobRaid[] {
  return raidSequenceOf(TOB, total, recorded, countsAtEnd, tobRaidOf, (mode) => ({
    mode,
    team_size: UNTRACKED_TEAM_SIZE,
    tracked: false,
  }));
}

/** The chance a fair player would have had `itemId` by the end of `raids`. */
export function chanceByRaid(itemId: number, raids: TobRaid[]): number {
  let miss = 1;
  for (const r of raids) {
    const p = itemChance(itemId, r);
    if (Number.isNaN(p)) return NaN;
    miss *= 1 - p;
  }
  return 1 - miss;
}
