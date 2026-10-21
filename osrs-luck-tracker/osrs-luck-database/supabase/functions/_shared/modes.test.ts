// Run from osrs-luck-database/:
//   npx deno test --no-config --allow-read supabase/functions/_shared/

import { modeName, PAGE_MODES, pageOf, siblingSources } from "./modes.ts";

function assertEquals(actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`expected ${e}, got ${a}`);
}

Deno.test("PAGE_MODES lists exactly the variants clog_sources.json rates", async () => {
  const cfg = JSON.parse(await Deno.readTextFile(new URL("../../../data/clog_sources.json", import.meta.url)));
  const variants: Record<string, string[]> = {};
  for (const [page, spec] of Object.entries(cfg.pages as Record<string, { variants?: Record<string, unknown> }>)) {
    if (spec.variants) variants[page] = Object.keys(spec.variants);
  }
  const ours = Object.fromEntries(Object.entries(PAGE_MODES).map(([page, m]) => [page, m.variants]));
  assertEquals(Object.keys(ours).sort(), Object.keys(variants).sort());
  for (const page of Object.keys(variants)) assertEquals(ours[page], variants[page]);
});

Deno.test("a variant belongs to its page", () => {
  assertEquals(pageOf("Corrupted Gauntlet"), "The Gauntlet");
  assertEquals(pageOf("The Gauntlet"), "The Gauntlet");
  assertEquals(pageOf("Zulrah"), "Zulrah");
  assertEquals(siblingSources("Corrupted Gauntlet"), ["The Gauntlet", "Corrupted Gauntlet"]);
  assertEquals(siblingSources("Zulrah"), ["Zulrah"]);
  assertEquals(modeName("The Gauntlet"), "Gauntlet");
  assertEquals(modeName("Corrupted Gauntlet"), "Corrupted Gauntlet");
});
