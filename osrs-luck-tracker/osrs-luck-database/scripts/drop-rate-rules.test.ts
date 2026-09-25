// Run from osrs-luck-database/:
//   npx deno test --no-config --allow-read scripts/

import {
  combineIndependent,
  frac,
  type Fraction,
  type ItemRate,
  limitDenominator,
  parseRarity,
  rateFromRows,
  rowsForSpec,
  type WikiDrop,
} from "./drop-rate-rules.ts";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function assertFraction(actual: Fraction, n: number, d: number) {
  assert(actual.n === BigInt(n) && actual.d === BigInt(d), `expected ${n}/${d}, got ${actual.n}/${actual.d}`);
}

function assertRate(rate: ItemRate, n: number, d: number, rolls = 1) {
  assert(rate.kind === "rate", `expected a rate, got ${rate.kind}`);
  const r = rate as { value: Fraction; rolls: number };
  assertFraction(r.value, n, d);
  assert(r.rolls === rolls, `expected ${rolls} rolls, got ${r.rolls}`);
}

const drop = (item: string, rarity: string, droppedFrom = "Boss", rolls = 1): WikiDrop => ({
  page: droppedFrom.split("#")[0],
  droppedFrom,
  item,
  rarity,
  rolls,
});

Deno.test("parseRarity handles fractions, commas, decimals and words", () => {
  const f = (raw: string) => (parseRarity(raw) as { value: Fraction }).value;
  assertFraction(f("1/512"), 1, 512);
  assertFraction(f("5,535/43,400"), 1107, 8680);
  assertFraction(f("1/206.6"), 5, 1033);
  assertFraction(f("4/95.11"), 400, 9511);
  assertFraction(f("~1/100"), 1, 100);
  assert(parseRarity("Always").kind === "always", "Always");
  assert(parseRarity("Once").kind === "ignored", "Once");
  assert(parseRarity("Varies").kind === "ignored", "Varies");
  assert(parseRarity("1/128 (on task)").kind === "unparsed", "free text");
});

Deno.test("rows for the same item in one table add up", () => {
  // Araxxor's venom sac is listed at several quantities.
  const rows = [drop("Araxyte venom sac", "1/16"), drop("Araxyte venom sac", "5/115")];
  assertRate(rateFromRows(rows, "Araxyte venom sac"), 39, 368);
});

Deno.test("an Always row makes the item untrackable, as do chances summing to 1", () => {
  const scales = [drop("Zulrah's scales", "Always"), drop("Zulrah's scales", "5/249", "Boss", 2)];
  assert(rateFromRows(scales, "Zulrah's scales").kind === "always", "Always row");
  const tear = [drop("Frozen tear", "6/10"), drop("Frozen tear", "3/10"), drop("Frozen tear", "1/10")];
  assert(rateFromRows(tear, "Frozen tear").kind === "always", "sums to 1");
});

Deno.test("rolls carry through, and the wiki's disambiguated names match", () => {
  assertRate(rateFromRows([drop("Magic fang", "1/1,024", "Zulrah", 2)], "Magic fang"), 1, 1024, 2);
  assertRate(rateFromRows([drop("Gull (pet)", "1/3,000")], "Gull"), 1, 3000);
  assert(rateFromRows([drop("Magic fang", "1/1,024")], "Magic seed").kind === "none", "no false match");
});

Deno.test("rowsForSpec prefers the main table, then the first fragment, case-insensitively", () => {
  const drops = [
    drop("Yami", "1/100", "Yama#Contract"),
    drop("Yami", "1/2,500", "Yama"),
    drop("Seed", "1/120", "Reward Chest (The Gauntlet)#Regular"),
    drop("Seed", "1/50", "Reward Chest (The Gauntlet)#Corrupted"),
    drop("Gull (pet)", "1/3,000", "Shellbane gryphon"),
  ];
  assertRate(rateFromRows(rowsForSpec(drops, "Yama"), "Yami"), 1, 2500);
  assertRate(rateFromRows(rowsForSpec(drops, "Reward Chest (The Gauntlet)"), "Seed"), 1, 120);
  assertRate(rateFromRows(rowsForSpec(drops, "Reward Chest (The Gauntlet)#Corrupted"), "Seed"), 1, 50);
  assertRate(rateFromRows(rowsForSpec(drops, "Shellbane Gryphon"), "Gull"), 1, 3000);
});

Deno.test("combineIndependent gives the chance of at least one drop", () => {
  const waves = [
    rateFromRows([drop("Onyx", "1/2", "Chest#Wave 1")], "Onyx"),
    rateFromRows([drop("Onyx", "1/2", "Chest#Wave 2")], "Onyx"),
    { kind: "none" } as ItemRate,
  ];
  assertRate(combineIndependent(waves), 3, 4);
});

Deno.test("limitDenominator keeps rates within int4 with little error", () => {
  const exact = frac(123456789n, 98765432101n);
  const limited = limitDenominator(exact);
  assert(limited.d <= 1_000_000n, "denominator bounded");
  const err = Math.abs(Number(limited.n) / Number(limited.d) - 123456789 / 98765432101);
  assert(err < 1e-9, `error ${err}`);
  assertFraction(limitDenominator(frac(1n, 2448n)), 1, 2448);
});
