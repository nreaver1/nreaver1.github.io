import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { pickPlayer } from "./players.ts";

const row = (account_hash: string, last_updated: string) => ({ account_hash, ign: "Zezima", last_updated });

Deno.test("pickPlayer returns null for no rows", () => {
  assertEquals(pickPlayer([]), null);
});

Deno.test("pickPlayer prefers a real player over a demo one", () => {
  const demo = row("demo-zezima", "2026-09-25T00:00:00Z");
  const real = row("90ffabcd12345678", "2026-01-01T00:00:00Z");
  assertEquals(pickPlayer([demo, real]), real);
  assertEquals(pickPlayer([real, demo]), real);
});

Deno.test("pickPlayer prefers the most recently updated real player", () => {
  const oldOwner = row("1111111111111111", "2026-01-01T00:00:00Z");
  const newOwner = row("2222222222222222", "2026-09-01T00:00:00Z");
  assertEquals(pickPlayer([oldOwner, newOwner]), newOwner);
});

Deno.test("pickPlayer still finds a demo player on its own", () => {
  const demo = row("demo-zezima", "2026-09-25T00:00:00Z");
  assertEquals(pickPlayer([demo]), demo);
});
