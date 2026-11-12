// Run from osrs-luck-database/:
//   npx deno test --no-config --allow-read supabase/functions/_shared/

import { pageSourceForKc, raidKcLowerBound } from "./page-updates.ts";

function assertEquals(actual: unknown, expected: unknown) {
  if (actual !== expected) throw new Error(`expected ${expected}, got ${actual}`);
}

const SOURCES = ["Barrows Chests", "Moons of Peril", "Zulrah", "The Gauntlet", "Dagannoth Kings", "Royal Titans", "Tempoross"];

Deno.test("kill-count names raise their own page", () => {
  assertEquals(pageSourceForKc("Zulrah", SOURCES), "Zulrah");
  assertEquals(pageSourceForKc("Gauntlet", SOURCES), "The Gauntlet"); // leading "The"
  assertEquals(pageSourceForKc("Barrows chest", SOURCES), "Barrows Chests"); // one-to-one alias
  assertEquals(pageSourceForKc("Lunar Chest", SOURCES), "Moons of Peril");
});

Deno.test("a page several bosses' counts map to is never raised", () => {
  assertEquals(pageSourceForKc("Dagannoth Rex", SOURCES), undefined);
  assertEquals(pageSourceForKc("Royal Titan", SOURCES), undefined);
});

Deno.test("a page whose counter isn't kills is never raised", () => {
  // Tempoross's page counts reward permits.
  assertEquals(pageSourceForKc("Tempoross", SOURCES), undefined);
});

Deno.test("a source the account has no page or hunting rows for isn't matched", () => {
  assertEquals(pageSourceForKc("Vorkath", SOURCES), undefined);
});

Deno.test("each mode's kill count raises its own rows on a multi-mode page", () => {
  // Hunting rows are stored per mode (_shared/modes.ts).
  const sources = ["The Gauntlet", "Corrupted Gauntlet", "Callisto and Artio", "Artio"];
  assertEquals(pageSourceForKc("Gauntlet", sources), "The Gauntlet");
  assertEquals(pageSourceForKc("Corrupted Gauntlet", sources), "Corrupted Gauntlet");
  assertEquals(pageSourceForKc("Callisto", sources), "Callisto and Artio");
  assertEquals(pageSourceForKc("Artio", sources), "Artio");
});

Deno.test("a raid's completion count never raises its page on its own", () => {
  // The page counts every mode; raidKcLowerBound handles raid counts.
  const sources = ["Chambers of Xeric", "Theatre of Blood", "Tombs of Amascut"];
  assertEquals(pageSourceForKc("Theatre of Blood", sources), undefined);
  assertEquals(pageSourceForKc("Chambers of Xeric Challenge Mode", sources), undefined);
});

Deno.test("a raid page's kill count adds up the most each mode is known at", () => {
  // Chat alone: only the modes seen.
  assertEquals(raidKcLowerBound("Theatre of Blood", { normal: 12 }, null), 12);
  assertEquals(raidKcLowerBound("Theatre of Blood", { normal: 12, hard: 3 }, null), 15);
  // The latest recorded raid fills in modes chat didn't mention.
  assertEquals(raidKcLowerBound("Chambers of Xeric", { normal: 41 }, { normal: 40, challenge: 7 }), 48);
  // A count lower than the recorded one doesn't lower it.
  assertEquals(raidKcLowerBound("Chambers of Xeric", { challenge: 2 }, { normal: 40, challenge: 7 }), 47);
  // Modes another raid has don't count.
  assertEquals(raidKcLowerBound("Chambers of Xeric", { hard: 9 } as Record<string, number>, null), 0);
});
