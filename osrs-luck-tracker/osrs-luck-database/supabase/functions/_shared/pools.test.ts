// Run from osrs-luck-database/:
//   npx deno test --no-config --allow-read supabase/functions/_shared/

import { poolsForPage } from "./pools.ts";
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

// 24 pieces at 1/2448 per roll, 7 rolls a chest, and bolt racks at their own rate.
// Made-up ids: the real pieces are 4708 upwards in steps of 2, which runs into 4740.
const PIECES = Array.from({ length: 24 }, (_, i) => 90000 + i);
const barrows = [...PIECES.map((id) => rate(id, "Barrows Chests", 2448, 7)), rate(4740, "Barrows Chests", 1012, 7)];

Deno.test("Barrows at 206 chests: 16 uniques is a little spooned, 11 of 24 is even", () => {
  // A real log read: 11 pieces, 16 copies in all.
  const quantities: Record<string, number> = {};
  const owned = PIECES.slice(0, 11);
  [3, 3, 2, 1, 1, 1, 1, 1, 1, 1, 1].forEach((q, i) => (quantities[String(owned[i])] = q)); // 16
  const pools = poolsForPage({ source_name: "Barrows Chests", kc: 206, obtained: [...owned, 4740], quantities }, barrows);

  assert(pools.length === 1, `bolt racks aren't pooled, got ${pools.length} pools`);
  const [pool] = pools;
  assert(pool.item_ids.length === 24, "every piece is in the pool");
  assert(pool.total!.count === 16, `total ${pool.total!.count}`);
  assertClose(pool.total!.expected, 14.137);
  assertClose(pool.total!.probability, 0.2996);
  assert(pool.distinct.count === 11 && pool.distinct.of === 24, "11 of 24");
  assertClose(pool.distinct.expected, 10.685);
  assertClose(pool.distinct.probability, 0.4470);
});

Deno.test("Moons of Peril at 78: 7 of 12 with no duplicates", () => {
  const ids = [28988, 28997, 29000, 29004, 29007, 29010, 29013, 29016, 29019, 29022, 29025, 29028];
  const moons = [...ids.map((id) => rate(id, "Moons of Peril", 224)), rate(28991, "Moons of Peril", 6, 6)];
  const owned = [28988, 29000, 29004, 29007, 29010, 29013, 29025];
  const quantities = Object.fromEntries(owned.map((id) => [String(id), 1]));

  const [pool] = poolsForPage({ source_name: "Moons of Peril", kc: 78, obtained: owned, quantities }, moons);

  // With no duplicates both questions have the same count, but not the
  // same expectation: 4.18 uniques, 3.53 different ones.
  assert(pool.total!.count === 7 && pool.distinct.count === 7, "7 and 7");
  assert(pool.total!.expected > pool.distinct.expected, "fewer distinct than total expected");
  assert(pool.total!.label === "average" || pool.total!.label === "spooned", `total ${pool.total!.probability}`);
  assert(pool.distinct.label === "spooned", `distinct ${pool.distinct.probability}`);
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

Deno.test("only listed sources are pooled", () => {
  const rates = PIECES.map((id) => rate(id, "General Graardor", 381));
  assert(poolsForPage({ source_name: "General Graardor", kc: 500, obtained: [], quantities: {} }, rates).length === 0,
    "not a pooled source");
});
