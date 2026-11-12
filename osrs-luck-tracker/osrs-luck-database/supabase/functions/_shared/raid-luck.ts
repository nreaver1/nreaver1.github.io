// Rates raid drops, raid still-hunting items and the per-raid summary
// from an account's recorded completions (_shared/raids.ts, and each
// raid's model: toa.ts, cox.ts, tob.ts). get-player-luck and the
// leaderboard call these for rates whose metadata has its page's
// raid_model; everything else stays on calculateLuck.

import { labelFor } from "./calculations.ts";
import * as cox from "./cox.ts";
import { RAIDS, totalOf, type ModeCounts, type RaidCompletion, type RaidRollContext } from "./raids.ts";
import * as tob from "./tob.ts";
import * as toa from "./toa.ts";
import { purplesMidP, TOA, TOA_JEWELS } from "./toa.ts";
import type { CollectionLogDrop, DropRate, HuntingResult, LuckResult } from "./types.ts";

/** How one raid page's items are rated over its raids. */
export interface RaidModel {
  page: string;
  key: string; // drop_rates.metadata.raid_model
  items: number[];
  /** Raids 1..total, recorded or assumed. */
  sequence(total: number, recorded: RaidCompletion[], countsAtEnd: ModeCounts): unknown[];
  /** A fair player's chance of the item by the end of the raids; NaN if not rated. */
  chance(itemId: number, raids: unknown[], jewelKcs: (number | null)[]): number;
  /** This player's chance of a unique from a recorded raid. */
  uniqueChance(r: RaidCompletion): number;
  /** The same for the last-raid line, or null when the points it needs weren't read. */
  lastRaidChance(r: RaidCompletion): number | null;
}

export const RAID_MODELS: RaidModel[] = [
  {
    page: TOA,
    key: "toa",
    items: toa.TOA_ITEMS,
    sequence: toa.raidSequence,
    chance: (itemId, raids, jewelKcs) => toa.chanceByRaid(itemId, raids as toa.ToaRaid[], jewelKcs),
    uniqueChance: (r) => toa.uniqueChance(toa.toaRaidOf(r)),
    lastRaidChance: (r) => (r.personal_points === null ? null : toa.uniqueChance(toa.toaRaidOf(r))),
  },
  {
    page: cox.COX,
    key: "cox",
    items: cox.COX_ITEMS,
    sequence: cox.raidSequence,
    chance: (itemId, raids) => cox.chanceByRaid(itemId, raids as cox.CoxRaid[]),
    uniqueChance: (r) => cox.uniqueChance(cox.coxRaidOf(r)),
    lastRaidChance: (r) => (r.personal_points === null ? null : cox.uniqueChance(cox.coxRaidOf(r))),
  },
  {
    page: tob.TOB,
    key: "tob",
    items: tob.TOB_ITEMS,
    sequence: tob.raidSequence,
    chance: (itemId, raids) => tob.chanceByRaid(itemId, raids as tob.TobRaid[]),
    uniqueChance: (r) => tob.uniqueChance(tob.tobRaidOf(r)),
    lastRaidChance: (r) => tob.uniqueChance(tob.tobRaidOf(r)),
  },
];

const modelForPage = (page: string): RaidModel | undefined => RAID_MODELS.find((m) => m.page === page);

export interface RaidHistory {
  raids: RaidCompletion[];
  drops: CollectionLogDrop[]; // the account's drops, for jewel duplicate protection
}

/** A rate rated raid by raid: its raid_model is its page's model. */
export const isRaidRate = (rate: DropRate): boolean =>
  rate.metadata?.["raid_model"] !== undefined && modelForPage(rate.source_name)?.key === rate.metadata["raid_model"];

/** Items the page's model rates, so a page read can show the missing ones. */
export const raidPageItems = (page: string): number[] => modelForPage(page)?.items ?? [];

const rollContext = (drop: CollectionLogDrop): RaidRollContext => (drop.roll_context ?? {}) as RaidRollContext;

/**
 * Every mode's count when the drop came: stored with it, else the
 * recorded raid it came from, else (an older drop) all of it in the mode
 * it was sent under.
 */
export function countsAtDrop(drop: CollectionLogDrop, history: RaidHistory): ModeCounts {
  const ctx = rollContext(drop);
  if (ctx.mode_counts && totalOf(ctx.mode_counts) === drop.kc_received) return ctx.mode_counts;
  const raid = history.raids.find((r) => r.raid === drop.source_name && r.total_kc === drop.kc_received);
  if (raid) return raid.mode_counts;
  return { [ctx.mode ?? "normal"]: drop.kc_received ?? 0 };
}

/** Total completion counts the player's other jewels came on (null = before tracking, or unknown). */
function otherJewelKcs(itemId: number, history: RaidHistory, obtainedOnPage: number[] = []): (number | null)[] {
  if (!TOA_JEWELS.includes(itemId)) return [];
  const fromDrops = new Map<number, number | null>();
  for (const d of history.drops) {
    if (d.source_name !== TOA || d.item_id === itemId || !TOA_JEWELS.includes(d.item_id)) continue;
    const kc = d.is_backfilled || d.kc_received == null ? null : d.kc_received;
    const prev = fromDrops.get(d.item_id);
    // The earliest known count wins; unknown only when no row knows it.
    fromDrops.set(d.item_id, prev == null ? kc : kc == null ? prev : Math.min(prev, kc));
  }
  for (const id of obtainedOnPage) {
    if (id !== itemId && TOA_JEWELS.includes(id) && !fromDrops.has(id)) fromDrops.set(id, null);
  }
  return [...fromDrops.values()];
}

/** A tracked raid drop's luck. Backfilled rows never get here (calculateLuck handles them). */
export function raidDropLuck(drop: CollectionLogDrop, history: RaidHistory): LuckResult {
  const base = {
    item_id: drop.item_id,
    source_name: drop.source_name,
    kc_received: drop.kc_received,
    date_received: drop.date_received,
    estimated: true,
    backfilled: false,
  };
  const total = drop.kc_received ?? 0;
  const model = modelForPage(drop.source_name);
  const probability = model && total > 0
    ? model.chance(
      drop.item_id,
      model.sequence(total, history.raids, countsAtDrop(drop, history)),
      otherJewelKcs(drop.item_id, history),
    )
    : NaN;
  if (Number.isNaN(probability)) {
    return { ...base, probability: NaN, label: "average", supported: false };
  }
  return { ...base, probability, label: labelFor(probability), supported: true };
}

/** The latest counts known: the newest recorded raid's, topped up to the page read's total as normal mode. */
export function latestCounts(raid: string, history: RaidHistory, pageKc: number): ModeCounts {
  const newest = history.raids
    .filter((r) => r.raid === raid)
    .reduce<RaidCompletion | null>((a, b) => (!a || b.total_kc > a.total_kc ? b : a), null);
  const counts: ModeCounts = { ...(newest?.mode_counts ?? {}) };
  const missing = pageKc - totalOf(counts);
  if (missing > 0) counts.normal = (counts.normal ?? 0) + missing;
  return counts;
}

const MODE_LABELS: Record<string, string> = {
  entry: "Entry Mode",
  normal: "Normal",
  expert: "Expert Mode",
  challenge: "Challenge Mode",
  hard: "Hard Mode",
};

/**
 * Still-hunting rows for a raid page: every rated item the page read shows
 * missing and no drop row has, rated over all the raids so far.
 */
export function raidHunting(
  page: { source_name: string; kc: number; obtained: number[]; updated_at?: string | null },
  rates: Map<string, DropRate>,
  history: RaidHistory,
): HuntingResult[] {
  const model = modelForPage(page.source_name);
  if (!model) return [];
  const raid = model.page;
  const counts = latestCounts(raid, history, page.kc);
  const total = totalOf(counts);
  if (total <= 0) return [];
  const raids = model.sequence(total, history.raids, counts);
  const recorded = new Set(history.drops.filter((d) => d.source_name === raid).map((d) => d.item_id));
  const newestRaid = history.raids.filter((r) => r.raid === raid).map((r) => r.completed_at).sort().pop() ?? null;
  const updatedAt = [page.updated_at ?? null, newestRaid].filter((s): s is string => !!s).sort().pop() ?? null;
  const modes = Object.keys(RAIDS[raid].modes)
    .filter((m) => (counts[m] ?? 0) > 0)
    .map((m) => ({ source_name: raid, name: MODE_LABELS[m] ?? m, kc: counts[m] }));

  return model.items.flatMap((itemId) => {
    const rate = rates.get(`${itemId}::${raid}`);
    if (!rate || !isRaidRate(rate) || page.obtained.includes(itemId) || recorded.has(itemId)) return [];
    const probability = model.chance(itemId, raids, otherJewelKcs(itemId, history, page.obtained));
    // Zero: none of these raids could drop it (a Hard Mode kit after Normal raids only).
    if (Number.isNaN(probability) || probability <= 0) return [];
    return [{
      item_id: itemId,
      source_name: raid,
      kc: total,
      probability,
      label: labelFor(probability),
      updated_at: updatedAt,
      ...(modes.length > 1 ? { modes } : {}),
    }];
  });
}

export interface RaidSummary {
  raid: string;
  mode_counts: ModeCounts; // latest known completions per mode
  total: number;
  recorded: number; // completions the plugin recorded
  tracked: number; // of those, the ones whose purple result it saw
  purples: number; // of those, raids where this player got the unique
  expected_purples: number; // a fair-luck player's expected purples over the same raids
  probability: number | null; // mid-p; low = more purples than expected. Null with no tracked raids.
  label: LuckResult["label"] | null;
  last_raid: {
    mode: string;
    raid_level: number | null;
    team_size: number | null;
    personal_points: number | null;
    unique_chance: number | null; // this player's chance of a purple from it
    purple: boolean | null;
    purple_mine: boolean | null;
    completed_at: string;
  } | null;
}

/** One summary per raid the account has recorded completions or a page read for. */
export function raidSummaries(history: RaidHistory, pageKcs: Map<string, number>): RaidSummary[] {
  return RAID_MODELS.flatMap((model) => {
    const raid = model.page;
    const recorded = history.raids.filter((r) => r.raid === raid);
    if (recorded.length === 0) return []; // nothing beyond what the log page says
    const counts = latestCounts(raid, history, pageKcs.get(raid) ?? 0);
    const seen = recorded.filter((r) => r.purple_mine !== null);
    const chances = seen.map((r) => model.uniqueChance(r));
    const purples = seen.filter((r) => r.purple_mine).length;
    const last = recorded.reduce((a, b) => (b.total_kc > a.total_kc ? b : a));
    const level = typeof last.details?.raid_level === "number" ? (last.details.raid_level as number) : null;
    const probability = seen.length > 0 ? purplesMidP(chances, purples) : null;
    return [{
      raid,
      mode_counts: counts,
      total: totalOf(counts),
      recorded: recorded.length,
      tracked: seen.length,
      purples,
      expected_purples: chances.reduce((a, b) => a + b, 0),
      probability,
      label: probability === null ? null : labelFor(probability),
      last_raid: {
        mode: last.mode,
        raid_level: level,
        team_size: last.team_size,
        personal_points: last.personal_points,
        unique_chance: model.lastRaidChance(last),
        purple: last.purple,
        purple_mine: last.purple_mine,
        completed_at: last.completed_at,
      },
    }];
  });
}
