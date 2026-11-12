// Chambers of Xeric drop chances, raid by raid. Transcribed from the OSRS
// Wiki's "Ancient chest", "Olmlet", "Metamorphic dust" and "Twisted
// ancestral colour kit" pages (2026-11-12).
//
//  - Uniques: the team gets 1% per 8,676 points, capped at 65.7% (570,000
//    points) per roll; points past each 570,000 roll again, up to six
//    uniques. Each unique goes to one player, more likely the more of the
//    team's points they have; the wiki gives no exact weighting, so a
//    player's share is taken as their points over the team's. The item is
//    then picked by weight (12 August 2026 table: normal 60, Challenge
//    Mode 56). Every raid is rated with today's weights; tracking only
//    started after the change, and an untracked raid's date isn't known.
//  - Olmlet: 1/53 for the player each time they receive a unique, both modes.
//  - Metamorphic dust 1/400 and the twisted ancestral kit 1/75, each player,
//    Challenge Mode only, on top of any other loot. Both need the raid done
//    inside the time limit; that's assumed, since the plugin can't tell.
//
// Raids from before tracking, or a field the plugin couldn't read, use
// UNTRACKED_DEFAULTS for their mode.

import { raidSequenceOf, type ModeCounts, type RaidCompletion } from "./raids.ts";

export const COX = "Chambers of Xeric";

const DEX = 21034;
const ARCANE = 21079;
const BUCKLER = 21000;
const DHCB = 21012;
const BULWARK = 21015;
const ANC_HAT = 21018;
const ANC_TOP = 21021;
const ANC_BOTTOM = 21024;
const CLAWS = 13652;
const MAUL = 21003;
const KODAI = 21043;
const TBOW = 20997;
export const COX_PET = 20851;
export const COX_DUST = 22386;
export const COX_KIT = 24670;

const WEIGHTS: Record<string, Map<number, number>> = {
  normal: new Map([
    [DEX, 14], [ARCANE, 14], [BUCKLER, 4], [DHCB, 4], [BULWARK, 3], [ANC_HAT, 4],
    [ANC_TOP, 4], [ANC_BOTTOM, 4], [CLAWS, 3], [MAUL, 2], [KODAI, 2], [TBOW, 2],
  ]),
  challenge: new Map([
    [DEX, 12], [ARCANE, 12], [BUCKLER, 4], [DHCB, 4], [BULWARK, 3], [ANC_HAT, 4],
    [ANC_TOP, 4], [ANC_BOTTOM, 4], [CLAWS, 3], [MAUL, 2], [KODAI, 2], [TBOW, 2],
  ]),
};

export const COX_PURPLES = [...WEIGHTS.normal.keys()];
export const COX_ITEMS = [...COX_PURPLES, COX_PET, COX_DUST, COX_KIT];

const POINTS_PER_PERCENT = 8_676;
const POINTS_PER_ROLL = 570_000;
const MAX_UNIQUES = 6;
const PET_PER_UNIQUE = 1 / 53;
const CM_TERTIARY: Record<number, number> = { [COX_DUST]: 1 / 400, [COX_KIT]: 1 / 75 };

/** A raid as the chance calculation sees it: recorded, or assumed for its mode. */
export interface CoxRaid {
  mode: string;
  team_points: number;
  personal_points: number;
  team_size: number;
  tracked: boolean;
}

// A deathless solo: ~30,000 points normally (the wiki money making guide),
// ~62,000 in Challenge Mode (57,000 plus 5,000 for finishing in time).
export const UNTRACKED_DEFAULTS: Record<string, Omit<CoxRaid, "mode" | "tracked">> = {
  normal: { team_points: 30_000, personal_points: 30_000, team_size: 1 },
  challenge: { team_points: 62_000, personal_points: 62_000, team_size: 1 },
};

/** The team's chance on each unique roll, from its total points. */
export function uniqueRolls(teamPoints: number): number[] {
  const rolls: number[] = [];
  for (let i = 0; i < MAX_UNIQUES; i++) {
    const points = Math.min(POINTS_PER_ROLL, teamPoints - i * POINTS_PER_ROLL);
    if (points <= 0) break;
    rolls.push(points / POINTS_PER_PERCENT / 100);
  }
  return rolls;
}

/** This player's share of the team's points, which picks who gets each unique. */
export function pointShare(raid: Pick<CoxRaid, "team_points" | "personal_points">): number {
  return raid.team_points > 0 ? Math.min(1, raid.personal_points / raid.team_points) : 0;
}

/** This player's expected uniques from the raid (their chance of one, below the cap). */
export function uniqueChance(raid: Pick<CoxRaid, "team_points" | "personal_points">): number {
  const share = pointShare(raid);
  return uniqueRolls(raid.team_points).reduce((sum, c) => sum + c * share, 0);
}

/** This player's chance of `itemId` from one raid; NaN for an item the model doesn't rate. */
export function itemChance(itemId: number, raid: CoxRaid): number {
  if (itemId in CM_TERTIARY) return raid.mode === "challenge" ? CM_TERTIARY[itemId] : 0;
  const weights = WEIGHTS[raid.mode] ?? WEIGHTS.normal;
  const total = [...weights.values()].reduce((a, b) => a + b, 0);
  let perUnique: number;
  if (itemId === COX_PET) perUnique = PET_PER_UNIQUE;
  else if (weights.has(itemId)) perUnique = weights.get(itemId)! / total;
  else return NaN;
  const share = pointShare(raid);
  let miss = 1;
  for (const c of uniqueRolls(raid.team_points)) miss *= 1 - c * share * perUnique;
  return 1 - miss;
}

/** A recorded completion, with defaults filling what the plugin couldn't read. */
export function coxRaidOf(r: RaidCompletion): CoxRaid {
  const defaults = UNTRACKED_DEFAULTS[r.mode] ?? UNTRACKED_DEFAULTS.normal;
  const teamSize = r.team_size ?? defaults.team_size;
  const total = typeof r.details?.total_points === "number" ? (r.details.total_points as number) : null;
  const personal = r.personal_points ?? (total !== null ? total / teamSize : defaults.personal_points);
  return {
    mode: r.mode,
    // Without the team's total, assume everyone scored the same.
    team_points: total ?? personal * teamSize,
    personal_points: personal,
    team_size: teamSize,
    tracked: true,
  };
}

export function raidSequence(total: number, recorded: RaidCompletion[], countsAtEnd: ModeCounts): CoxRaid[] {
  return raidSequenceOf(COX, total, recorded, countsAtEnd, coxRaidOf, (mode) => ({
    mode,
    ...(UNTRACKED_DEFAULTS[mode] ?? UNTRACKED_DEFAULTS.normal),
    tracked: false,
  }));
}

/** The chance a fair player would have had `itemId` by the end of `raids`. */
export function chanceByRaid(itemId: number, raids: CoxRaid[]): number {
  let miss = 1;
  for (const r of raids) {
    const p = itemChance(itemId, r);
    if (Number.isNaN(p)) return NaN;
    miss *= 1 - p;
  }
  return 1 - miss;
}
