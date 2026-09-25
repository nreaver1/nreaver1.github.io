/**
 * scripts/drop-rate-rules.ts
 *
 * Pure rules that turn OSRS Wiki drop rows (the wiki's `dropsline` bucket,
 * one row per {{DropsLine}}) into one drop_rates row per collection log
 * item. Kept separate from sync-drop-rates.ts so they can be unit tested
 * without the network: see drop-rate-rules.test.ts.
 */

/** One wiki drop row, trimmed to the fields the rules read. */
export interface WikiDrop {
  /** Wiki page the row lives on, e.g. "Reward Chest (The Gauntlet)". */
  page: string;
  /** Page plus optional table fragment, e.g. "Reward Chest (The Gauntlet)#Corrupted". */
  droppedFrom: string;
  item: string;
  rarity: string;
  rolls: number;
}

/** Exact fraction; bigint so decimal rarities and sums stay exact. */
export interface Fraction {
  n: bigint;
  d: bigint;
}

export type Rarity =
  | { kind: "fraction"; value: Fraction }
  | { kind: "always" } // guaranteed: nothing to be lucky about
  | { kind: "ignored" } // "Once"/"Never"/"Varies": a note, not a rate
  | { kind: "unparsed"; text: string };

function gcd(a: bigint, b: bigint): bigint {
  while (b) [a, b] = [b, a % b];
  return a < 0n ? -a : a;
}

export function frac(n: bigint, d: bigint): Fraction {
  const g = gcd(n, d) || 1n;
  return { n: n / g, d: d / g };
}

function decimalToFraction(text: string): Fraction {
  const [whole, dec = ""] = text.split(".");
  return frac(BigInt(whole + dec), 10n ** BigInt(dec.length));
}

/**
 * Parses the wiki's rarity strings: "1/512", "5,535/43,400", "1/25.8",
 * "~1/100", "Always". Decimal denominators ("1/206.6") come from the
 * wiki averaging a pity curve or several rolls; they stay exact
 * (5/1033) because drop_rates stores integers.
 */
export function parseRarity(raw: string): Rarity {
  const text = raw.replace(/,/g, "").trim();
  const m = text.match(/^~?\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
  if (m) {
    const num = decimalToFraction(m[1]);
    const den = decimalToFraction(m[2]);
    return { kind: "fraction", value: frac(num.n * den.d, num.d * den.n) };
  }
  const word = text.toLowerCase();
  if (word === "always") return { kind: "always" };
  if (word === "once" || word === "never" || word === "varies") return { kind: "ignored" };
  return { kind: "unparsed", text: raw };
}

export function add(a: Fraction, b: Fraction): Fraction {
  return frac(a.n * b.d + b.n * a.d, a.d * b.d);
}

export function mul(a: Fraction, b: Fraction): Fraction {
  return frac(a.n * b.n, a.d * b.d);
}

/** 1 - (1-p)^rolls: chance of at least one drop in `rolls` rolls. */
export function perKill(p: Fraction, rolls: number): Fraction {
  let miss = frac(p.d - p.n, p.d);
  let total = frac(1n, 1n);
  for (let i = 0; i < rolls; i++) total = mul(total, miss);
  return frac(total.d - total.n, total.d);
}

/**
 * Closest fraction with a denominator of at most `max` (continued
 * fractions). drop_rates stores int4s, and combining many rolls makes
 * exact denominators explode.
 */
export function limitDenominator(f: Fraction, max = 1_000_000n): Fraction {
  if (f.d <= max) return f;
  let [p0, q0, p1, q1] = [0n, 1n, 1n, 0n];
  let [n, d] = [f.n, f.d];
  while (true) {
    const a = n / d;
    const q2 = q0 + a * q1;
    if (q2 > max) break;
    [p0, q0, p1, q1] = [p1, q1, p0 + a * p1, q2];
    [n, d] = [d, n - a * d];
    if (d === 0n) break;
  }
  const k = (max - q0) / q1;
  const b1 = frac(p0 + k * p1, q0 + k * q1);
  const b2 = frac(p1, q1);
  const err = (x: Fraction) => {
    const diff = x.n * f.d - f.n * x.d;
    return frac(diff < 0n ? -diff : diff, x.d * f.d);
  };
  const e1 = err(b1), e2 = err(b2);
  return e2.n * e1.d <= e1.n * e2.d ? b2 : b1;
}

export type ItemRate =
  | { kind: "rate"; value: Fraction; rolls: number; droppedFrom: string }
  | { kind: "always"; droppedFrom: string }
  | { kind: "none" }
  | { kind: "unparsed"; texts: string[] };

/**
 * A wiki source spec from clog_sources.json. "Page" takes the page's
 * main table (rows dropped from exactly "Page"), falling back to its
 * first fragment ("Page#Members") when it has no main table.
 * "Page#Fragment" takes just that fragment.
 */
export function rowsForSpec(drops: WikiDrop[], spec: string): WikiDrop[] {
  // The bucket matches page names case-insensitively, so compare the same way.
  const eq = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  if (spec.includes("#")) return drops.filter((d) => eq(d.droppedFrom, spec));
  const onPage = drops.filter((d) => eq(d.page, spec));
  const main = onPage.filter((d) => eq(d.droppedFrom, spec));
  if (main.length || !onPage.length) return main;
  const first = onPage[0].droppedFrom;
  return onPage.filter((d) => d.droppedFrom === first);
}

const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * The rate for one item from one table. Rows for the same item in one
 * table are alternatives on the same roll (usually different quantities),
 * so their chances add. Any "Always" row makes the item guaranteed.
 */
export function rateFromRows(rows: WikiDrop[], item: string): ItemRate {
  let hits = rows.filter((r) => key(r.item) === key(item));
  // The wiki sometimes disambiguates a log item: "Gull (pet)" for "Gull".
  if (!hits.length) hits = rows.filter((r) => key(r.item.replace(/\s*\([^)]*\)$/, "")) === key(item));
  if (!hits.length) return { kind: "none" };
  const droppedFrom = hits[0].droppedFrom;
  const parsed = hits.map((h) => ({ h, r: parseRarity(h.rarity) }));
  if (parsed.some((p) => p.r.kind === "always")) return { kind: "always", droppedFrom };
  const unparsed = parsed.filter((p) => p.r.kind === "unparsed");
  if (unparsed.length) return { kind: "unparsed", texts: unparsed.map((p) => p.h.rarity) };
  const fractions = parsed.filter((p) => p.r.kind === "fraction");
  if (!fractions.length) return { kind: "none" };

  const rolls = new Set(fractions.map((p) => p.h.rolls));
  if (rolls.size === 1) {
    const sum = fractions.reduce(
      (acc, p) => add(acc, (p.r as { value: Fraction }).value),
      frac(0n, 1n),
    );
    return capped(sum, fractions[0].h.rolls, droppedFrom);
  }
  // Mixed roll counts: fold everything into one per-kill chance.
  const sum = fractions.reduce(
    (acc, p) => add(acc, perKill((p.r as { value: Fraction }).value, p.h.rolls)),
    frac(0n, 1n),
  );
  return capped(sum, 1, droppedFrom);
}

function capped(p: Fraction, rolls: number, droppedFrom: string): ItemRate {
  // Chances adding up to (nearly) 1 mean the item always drops.
  if (p.n * 1000n >= p.d * 999n) return { kind: "always", droppedFrom };
  return { kind: "rate", value: p, rolls, droppedFrom };
}

/**
 * Independent tables that each give a chance (e.g. the Colosseum's
 * per-wave rewards): chance of at least one drop across all of them.
 */
export function combineIndependent(rates: ItemRate[]): ItemRate {
  const real = rates.filter((r) => r.kind !== "none");
  if (!real.length) return { kind: "none" };
  const always = real.find((r) => r.kind === "always");
  if (always) return always;
  const unparsed = real.filter((r) => r.kind === "unparsed");
  if (unparsed.length) {
    return { kind: "unparsed", texts: unparsed.flatMap((r) => (r as { texts: string[] }).texts) };
  }
  let miss = frac(1n, 1n);
  for (const r of real) {
    const { value, rolls } = r as { value: Fraction; rolls: number };
    const k = perKill(value, rolls);
    miss = mul(miss, frac(k.d - k.n, k.d));
  }
  const drop = frac(miss.d - miss.n, miss.d);
  const first = real[0] as { droppedFrom: string };
  return capped(drop, 1, first.droppedFrom.split("#")[0]);
}
