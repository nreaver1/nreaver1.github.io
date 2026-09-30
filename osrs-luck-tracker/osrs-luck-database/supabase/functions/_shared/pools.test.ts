// Run from osrs-luck-database/:
//   npx deno test --no-config --allow-read supabase/functions/_shared/

import { POOLS, poolsForPage } from "./pools.ts";
import type { DropRate } from "./types.ts";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function assertClose(actual: number, expected: number, tolerance = 1e-3) {
  if (!(Math.abs(actual - expected) <= tolerance)) {
    throw new Error(`expected ${expected}, got ${actual}`);
  }
}

function rate(item_id: number, source_name: string, denominator: number, rolls_per_kill = 1): DropRate {
  return {
    item_id,
    source_name,
    distribution_type: "flat_geometric",
    numerator: 1,
    denominator,
    rolls_per_kill,
    metadata: {},
    source_updated_at: "2026-01-01T00:00:00Z",
  };
}

// The 24 pieces at 1/2448 per roll, 7 rolls a chest, and bolt racks at their own rate.
const PIECES = POOLS["Barrows Chests"];
const barrows = [...PIECES.map((id) => rate(id, "Barrows Chests", 2448, 7)), rate(4740, "Barrows Chests", 1012, 7)];

Deno.test("Barrows at 206 chests: 16 uniques is a little spooned, 11 of 24 is even", () => {
  // A real log read: 11 pieces, 16 copies in all, plus bolt racks.
  const owned = PIECES.slice(0, 11);
  const quantities: Record<string, number> = {};
  [3, 3, 2, 1, 1, 1, 1, 1, 1, 1, 1].forEach((q, i) => (quantities[String(owned[i])] = q));
  const pools = poolsForPage({ source_name: "Barrows Chests", kc: 206, obtained: [...owned, 4740], quantities }, barrows);

  assert(pools.length === 1, `one pool, got ${pools.length}`);
  const [pool] = pools;
  assert(pool.item_ids.length === 24 && !pool.item_ids.includes(4740), "the 24 pieces, no bolt racks");
  assert(pool.total!.count === 16, `total ${pool.total!.count}`);
  assertClose(pool.total!.expected, 14.137);
  assertClose(pool.total!.probability, 0.2996);
  assert(pool.distinct.count === 11 && pool.distinct.of === 24, "11 of 24");
  assertClose(pool.distinct.expected, 10.685);
  assertClose(pool.distinct.probability, 0.4470);
});

Deno.test("Moons of Peril at 78: 7 of 12 with no duplicates", () => {
  const ids = POOLS["Moons of Peril"];
  const moons = [...ids.map((id) => rate(id, "Moons of Peril", 224)), rate(28991, "Moons of Peril", 6, 6)];
  const owned = [28988, 29000, 29004, 29007, 29010, 29013, 29025];
  const quantities = Object.fromEntries(owned.map((id) => [String(id), 1]));

  const [pool] = poolsForPage({ source_name: "Moons of Peril", kc: 78, obtained: owned, quantities }, moons);

  // With no duplicates both questions have the same count, but not the
  // same expectation: 4.18 uniques, 3.53 different ones.
  assert(pool.total!.count === 7 && pool.distinct.count === 7, "7 and 7");
  assertClose(pool.total!.probability, 0.0908);
  assertClose(pool.distinct.probability, 0.0217);
});

Deno.test("a pool never takes in shared slots at the same rate", () => {
  // Graardor's godsword shards share a rate with each other but not the
  // armour; and they're shared slots anyway, so only the armour is pooled.
  const rates = [
    ...[11832, 11834, 11836].map((id) => rate(id, "General Graardor", 381)),
    ...[11818, 11820, 11822].map((id) => rate(id, "General Graardor", 762)),
  ];
  const pools = poolsForPage({ source_name: "General Graardor", kc: 500, obtained: [11818], quantities: {} }, rates);
  assert(pools.length === 1, `one pool, got ${pools.length}`);
  assert(pools[0].item_ids.join() === "11832,11834,11836", `got ${pools[0].item_ids}`);
  assert(pools[0].distinct.count === 0, "the shard doesn't count");
});

Deno.test("a pool whose items stop sharing a rate is dropped, not mixed", () => {
  const rates = [rate(11832, "General Graardor", 381), rate(11834, "General Graardor", 381), rate(11836, "General Graardor", 400)];
  assert(poolsForPage({ source_name: "General Graardor", kc: 500, obtained: [], quantities: {} }, rates).length === 0,
    "rates differ");
  assert(poolsForPage({ source_name: "General Graardor", kc: 500, obtained: [], quantities: {} }, rates.slice(0, 2)).length === 0,
    "an item is missing from the catalog");
});

Deno.test("a stackable pool item leaves the total out but keeps completion", () => {
  const quantities = { [String(PIECES[0])]: 1 }; // PIECES[1] obtained without a quantity
  const [pool] = poolsForPage(
    { source_name: "Barrows Chests", kc: 206, obtained: [PIECES[0], PIECES[1]], quantities },
    barrows,
  );
  assert(pool.total === null, "no total");
  assert(pool.distinct.count === 2, "still counts 2 distinct");
});

Deno.test("sources without a pool get none", () => {
  const rates = [11832, 11834, 11836].map((id) => rate(id, "K'ril Tsutsaroth", 381));
  assert(poolsForPage({ source_name: "K'ril Tsutsaroth", kc: 500, obtained: [], quantities: {} }, rates).length === 0,
    "not a pooled source");
});

Deno.test("every pool lists at least three distinct items", () => {
  for (const [source, ids] of Object.entries(POOLS)) {
    assert(ids.length >= 3 && new Set(ids).size === ids.length, `${source}: ${ids}`);
  }
});
