// Whole-page luck for log pages where many items share one drop rate
// (migration 0009).
//
// Rated one by one, 24 Barrows pieces at the same rate and kill count
// all get the same number, which repeats one fact 24 times. A pool rates
// the page's shared-rate items together instead, with two questions:
//
//  - total: how many copies of any of them, against
//    Binomial(kc * rolls_per_kill, sum of their chances per roll)
//  - distinct: how many different ones, against
//    Binomial(pool size, chance a given one has dropped by now)
//
// Both use binomialMidP, so like every other number here high means dry
// and labelFor's thresholds carry over.

import { binomialMidP, geometricCDF, labelFor } from "./calculations.ts";
import type { DropRate, LuckResult } from "./types.ts";

// Pages rated as pools, by drop_rates source name. Start small: these are
// the pages where every unique shares one rate.
export const POOLED_SOURCES = new Set(["Barrows Chests", "Moons of Peril"]);

// Fewer shared-rate items than this and per-item numbers say enough.
const MIN_POOL_SIZE = 3;

export interface LogPage {
  source_name: string;
  kc: number;
  obtained: number[];
  quantities: Record<string, number>; // item id -> quantity, non-stackable obtained items
}

export interface PoolScore {
  count: number;
  expected: number;
  probability: number;
  label: LuckResult["label"];
}

export interface PoolResult {
  source_name: string;
  kc: number;
  item_ids: number[]; // every item in the pool, ascending
  obtained_ids: number[]; // the pool items the page showed obtained
  quantities: Record<string, number>; // pool items only
  // Null when an obtained pool item had no quantity (a stackable slot),
  // since the page total can't be counted then.
  total: PoolScore | null;
  distinct: PoolScore & { of: number };
}

const rateKey = (r: DropRate) => `${r.numerator}/${r.denominator}x${r.rolls_per_kill}`;

/**
 * The pools for one log page: each group of at least MIN_POOL_SIZE
 * flat-rate items from the page's source sharing one rate. Empty for a
 * source not in POOLED_SOURCES.
 */
export function poolsForPage(page: LogPage, rates: DropRate[]): PoolResult[] {
  if (!POOLED_SOURCES.has(page.source_name) || !(page.kc > 0)) return [];

  const groups = new Map<string, DropRate[]>();
  for (const r of rates) {
    if (r.source_name !== page.source_name || r.distribution_type !== "flat_geometric") continue;
    const group = groups.get(rateKey(r)) ?? [];
    group.push(r);
    groups.set(rateKey(r), group);
  }

  const obtained = new Set(page.obtained);
  const results: PoolResult[] = [];
  for (const group of groups.values()) {
    if (group.length < MIN_POOL_SIZE) continue;
    const { numerator, denominator, rolls_per_kill } = group[0];
    const p = numerator / denominator;
    const trials = page.kc * rolls_per_kill;
    const itemIds = group.map((r) => r.item_id).sort((a, b) => a - b);
    const obtainedIds = itemIds.filter((id) => obtained.has(id));

    const quantities: Record<string, number> = {};
    let total = 0;
    let counted = true;
    for (const id of obtainedIds) {
      const q = page.quantities[String(id)];
      if (!(Number.isInteger(q) && q >= 1)) {
        counted = false;
        continue;
      }
      quantities[String(id)] = q;
      total += q;
    }

    // Chance one given item has dropped at least once by now.
    const eachByNow = geometricCDF(page.kc, numerator, denominator, rolls_per_kill);
    const distinctP = binomialMidP(itemIds.length, eachByNow, obtainedIds.length);
    if (distinctP === null) continue;

    const poolP = p * itemIds.length;
    const totalP = counted && poolP < 1 ? binomialMidP(trials, poolP, total) : null;

    results.push({
      source_name: page.source_name,
      kc: page.kc,
      item_ids: itemIds,
      obtained_ids: obtainedIds,
      quantities,
      total: totalP === null
        ? null
        : { count: total, expected: trials * poolP, probability: totalP, label: labelFor(totalP) },
      distinct: {
        count: obtainedIds.length,
        of: itemIds.length,
        expected: itemIds.length * eachByNow,
        probability: distinctP,
        label: labelFor(distinctP),
      },
    });
  }
  return results;
}
