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

// The pools, by drop_rates source name: items that share one flat rate
// and appear only on that source's log page. A slot the log fills on
// several drop sources' pages (godsword shards, Virtus, uncut onyx)
// counts copies from all of them, so it's never listed; pages that only
// index items, like "Slayer" for the Hydra parts, don't matter. Each
// page also needs a single kill count for the plugin to send a read, which
// rules out Dagannoth Kings, The Nightmare and Wintertodt.
export const POOLS: Record<string, number[]> = {
  "Abyssal Sire": [13274, 13275, 13276], // bludgeon pieces
  "Alchemical Hydra": [22969, 22971, 22973], // heart, fang, eye
  "Araxxor": [29790, 29792, 29794], // noxious pieces
  "Barrows Chests": [
    4708, 4710, 4712, 4714, 4716, 4718, 4720, 4722, 4724, 4726, 4728, 4730,
    4732, 4734, 4736, 4738, 4745, 4747, 4749, 4751, 4753, 4755, 4757, 4759,
  ], // the 24 brothers' pieces
  "Cerberus": [13227, 13229, 13231, 13233], // crystals and smouldering stone
  "General Graardor": [11832, 11834, 11836], // Bandos armour
  "Kree'arra": [11826, 11828, 11830], // Armadyl armour
  "Moons of Peril": [
    28988, 28997, 29000, 29004, 29007, 29010, 29013, 29016, 29019, 29022, 29025, 29028,
  ], // the three moons' armour and weapons
  "Nex": [26372, 26376, 26378, 26380], // Torva and Nihil horn
  // Not Royal Titans: each kill loots one titan, so only two of its four
  // uniques can roll, and a prayer scroll stops dropping once read.
  "Yama": [30750, 30753, 30756], // Oathplate
  "Zulrah": [12922, 12927, 12932], // fang, visage, magic fang
};

export const POOLED_SOURCES = new Set(Object.keys(POOLS));

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
 * The pool for one log page, as a list of zero or one: POOLS' items for
 * the page's source. Empty for a source without a pool, and also when
 * any listed item is missing from the catalog or the items no longer
 * share one flat rate (say a wiki resync changed one), rather than
 * rating a mix of rates as if they were one.
 */
export function poolsForPage(page: LogPage, rates: DropRate[]): PoolResult[] {
  const ids = POOLS[page.source_name];
  if (!ids || !(page.kc > 0)) return [];

  const byItem = new Map(
    rates.filter((r) => r.source_name === page.source_name).map((r) => [r.item_id, r]),
  );
  const group: DropRate[] = [];
  for (const id of ids) {
    const r = byItem.get(id);
    if (!r || r.distribution_type !== "flat_geometric") return [];
    group.push(r);
  }
  if (new Set(group.map(rateKey)).size !== 1) return [];

  const { numerator, denominator, rolls_per_kill } = group[0];
  const p = numerator / denominator;
  const trials = page.kc * rolls_per_kill;
  const itemIds = [...ids].sort((a, b) => a - b);
  const obtained = new Set(page.obtained);
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
  if (distinctP === null) return [];

  const poolP = p * itemIds.length;
  const totalP = counted && poolP < 1 ? binomialMidP(trials, poolP, total) : null;

  return [{
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
  }];
}
