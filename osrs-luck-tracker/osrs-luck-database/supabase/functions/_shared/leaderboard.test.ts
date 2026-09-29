import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { averageDropPercentile, MIN_RATED_DROPS, rankPlayers } from "./leaderboard.ts";
import type { LuckResult } from "./types.ts";

const rated = (item_id: number, probability: number): LuckResult => ({
  item_id,
  source_name: "Zulrah",
  kc_received: 100,
  date_received: "2026-01-01T00:00:00.000Z",
  probability,
  label: "average",
  estimated: false,
  supported: true,
  backfilled: false,
});

const backfilled = (item_id: number): LuckResult => ({
  ...rated(item_id, NaN),
  kc_received: null,
  date_received: null,
  supported: false,
  backfilled: true,
});

const unsupported = (item_id: number): LuckResult => ({ ...rated(item_id, NaN), supported: false });

Deno.test("rankPlayers splits players into luckiest and driest by average probability", () => {
  const board = rankPlayers([
    { ign: "Lucky", results: [rated(1, 0.05), rated(2, 0.1), rated(3, 0.15)] },
    { ign: "Dry", results: [rated(1, 0.9), rated(2, 0.95), rated(3, 0.99)] },
    { ign: "Bit lucky", results: [rated(1, 0.3), rated(2, 0.4), rated(3, 0.5)] },
  ]);
  assertEquals(board.luckiest.map((e) => e.ign), ["Lucky", "Bit lucky"]);
  assertEquals(board.driest.map((e) => e.ign), ["Dry"]);
  assertEquals(board.luckiest[0].rated_drops, 3);
  assertEquals(board.luckiest[0].demo, false);
  assertEquals(board.luckiest[0].average_probability.toFixed(2), "0.10");
});

Deno.test("rankPlayers highlights the most spooned drop for luckiest and the driest for driest", () => {
  const board = rankPlayers([
    { ign: "Lucky", results: [rated(1, 0.2), rated(2, 0.01), rated(3, 0.3)] },
    { ign: "Dry", results: [rated(4, 0.7), rated(5, 0.999), rated(6, 0.8)] },
  ]);
  assertEquals(board.luckiest[0].highlight.item_id, 2);
  assertEquals(board.driest[0].highlight.item_id, 5);
});

Deno.test("rankPlayers ignores backfilled and unsupported drops and needs enough rated ones", () => {
  const board = rankPlayers([
    {
      ign: "Few",
      results: [rated(1, 0.01), rated(2, 0.02), backfilled(3), unsupported(4), backfilled(5)],
    },
    { ign: "Enough", results: [rated(1, 0.2), rated(2, 0.2), rated(3, 0.2), backfilled(4)] },
  ]);
  assertEquals(MIN_RATED_DROPS, 3);
  assertEquals(board.luckiest.map((e) => e.ign), ["Enough"]);
  assertEquals(board.luckiest[0].rated_drops, 3);
});

Deno.test("rankPlayers breaks ties by rated drop count and caps the list size", () => {
  const board = rankPlayers(
    [
      { ign: "Three", results: [rated(1, 0.1), rated(2, 0.1), rated(3, 0.1)] },
      { ign: "Four", results: [rated(1, 0.1), rated(2, 0.1), rated(3, 0.1), rated(4, 0.1)] },
      { ign: "Worse", results: [rated(1, 0.2), rated(2, 0.2), rated(3, 0.2)] },
    ],
    2,
  );
  assertEquals(board.luckiest.map((e) => e.ign), ["Four", "Three"]);
});

Deno.test("rankPlayers leaves an exactly even player off both lists", () => {
  const board = rankPlayers([{ ign: "Even", results: [rated(1, 0.4), rated(2, 0.5), rated(3, 0.6)] }]);
  assertEquals(board.luckiest, []);
  assertEquals(board.driest, []);
});

Deno.test("rankPlayers carries the demo flag through", () => {
  const board = rankPlayers([{ ign: "Spoonfed", demo: true, results: [rated(1, 0.1), rated(2, 0.1), rated(3, 0.1)] }]);
  assertEquals(board.luckiest[0].demo, true);
});

Deno.test("averageDropPercentile matches known Irwin-Hall values and is symmetric", () => {
  // n = 3, mean 0.2: sum 0.6, CDF = 0.6^3 / 3! = 0.036.
  assertEquals(averageDropPercentile(0.6, 3).toFixed(4), "0.0360");
  assertEquals(averageDropPercentile(1.5, 3), 0.5);
  for (const n of [5, 20, 21, 50]) {
    const low = averageDropPercentile(n * 0.4, n);
    const high = averageDropPercentile(n * 0.6, n);
    assertEquals((low + high).toFixed(4), "1.0000");
  }
  // Normal path: n = 50, mean 0.4 is about 2.45 sd below; P ~ 0.0072.
  assertEquals(averageDropPercentile(20, 50).toFixed(3), "0.007");
});

Deno.test("rankPlayers ranks more drops at a milder average above a lucky few", () => {
  const many = Array.from({ length: 50 }, (_, i) => rated(i, 0.3));
  const board = rankPlayers([
    { ign: "Three lucky", results: [rated(1, 0.2), rated(2, 0.2), rated(3, 0.2)] },
    { ign: "Fifty steady", results: many },
  ]);
  assertEquals(board.luckiest.map((e) => e.ign), ["Fifty steady", "Three lucky"]);
  assertEquals(board.luckiest[1].percentile.toFixed(4), "0.0360");
});
