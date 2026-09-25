// Run from osrs-luck-database/:
//   npx deno test --no-config --allow-read supabase/functions/_shared/

import { matchSource } from "./kc-aliases.ts";

function assertEquals(actual: unknown, expected: unknown) {
  if (actual !== expected) throw new Error(`expected ${expected}, got ${actual}`);
}

Deno.test("matchSource prefers an exact or normalized match", () => {
  assertEquals(matchSource("Zulrah", ["Zulrah"]), "Zulrah");
  assertEquals(matchSource("Gauntlet", ["The Gauntlet", "Corrupted Gauntlet"]), "The Gauntlet");
  assertEquals(matchSource("Corrupted Gauntlet", ["The Gauntlet", "Corrupted Gauntlet"]), "Corrupted Gauntlet");
  assertEquals(matchSource("Artio", ["Callisto and Artio", "Artio"]), "Artio");
});

Deno.test("matchSource maps kill-count names to their log page", () => {
  assertEquals(matchSource("Dagannoth Rex", ["Dagannoth Kings"]), "Dagannoth Kings");
  assertEquals(matchSource("Barrows chest", ["Barrows Chests"]), "Barrows Chests");
  assertEquals(matchSource("Callisto", ["Callisto and Artio", "Artio"]), "Callisto and Artio");
  assertEquals(matchSource("TzTok-Jad", ["The Fight Caves"]), "The Fight Caves");
});

Deno.test("matchSource rejects an item the named boss doesn't drop", () => {
  assertEquals(matchSource("Dagannoth Rex", ["Zulrah"]), undefined);
  assertEquals(matchSource("Zulrah", ["Vorkath"]), undefined);
});
