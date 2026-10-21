// Run from osrs-luck-database/:
//   npx deno test --no-config --allow-read supabase/functions/_shared/

import { pageSourceForKc } from "./page-updates.ts";

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
