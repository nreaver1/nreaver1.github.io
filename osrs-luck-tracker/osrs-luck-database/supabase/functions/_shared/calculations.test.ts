// Run from osrs-luck-database/:
//   npx deno test --no-config --allow-read supabase/functions/_shared/

import {
  calculateLuck,
  geometricCDF,
  pointsBasedApprox,
  snapshotLuck,
  streakAdjustedApprox,
} from "./calculations.ts";
import type { CollectionLogDrop, DropRate } from "./types.ts";

function assertClose(actual: number, expected: number, tolerance = 1e-9) {
  if (!(Math.abs(actual - expected) <= tolerance)) {
    throw new Error(`expected ${expected}, got ${actual}`);
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function rate(overrides: Partial<DropRate>): DropRate {
  return {
    item_id: 1,
    source_name: "Test",
    distribution_type: "flat_geometric",
    numerator: 1,
    denominator: 100,
    rolls_per_kill: 1,
    metadata: {},
    source_updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function drop(overrides: Partial<CollectionLogDrop>): CollectionLogDrop {
  return {
    id: "d",
    account_hash: "a",
    item_id: 1,
    source_name: "Test",
    kc_received: 10,
    kc_at_previous_drop: 10,
    roll_context: null,
    date_received: null,
    date_submitted: "2026-01-01T00:00:00Z",
    is_backfilled: false,
    ...overrides,
  };
}

Deno.test("geometricCDF at kc == denominator approaches 1 - 1/e", () => {
  assertClose(geometricCDF(512, 1, 512), 1 - Math.pow(511 / 512, 512));
  assertClose(geometricCDF(512, 1, 512), 1 - 1 / Math.E, 1e-3);
});

Deno.test("points_based matches the per-raid chance for CoX", () => {
  // Twisted bow: 1% per 8,676 points, weight 2/60, at 30,000 points.
  const tbow = rate({
    distribution_type: "points_based",
    numerator: 2,
    denominator: 6000,
    metadata: { avg_points_per_activity: 30000, points_per_roll: 8676 },
  });
  const perRaid = pointsBasedApprox(1, tbow);
  assertClose(perRaid, (30000 / 867600) * (2 / 60), 1e-6);
  // One raid must count for its full share, not be floored to 3 rolls.
  assert(perRaid > geometricCDF(3, 2, 6000), "first raid was floored");
});

Deno.test("points_based without metadata falls back to flat geometric", () => {
  const bare = rate({ distribution_type: "points_based" });
  assertClose(pointsBasedApprox(50, bare), geometricCDF(50, 1, 100));
});

Deno.test("pity_thresholds: guaranteed drop on the 50th kill", () => {
  const head = rate({
    distribution_type: "streak_adjusted",
    denominator: 50,
    metadata: {
      pity_thresholds: [{ kc: 49, denominator: 50 }, { kc: 50, denominator: 1 }],
    },
  });
  assertClose(streakAdjustedApprox(1, head), 1 / 50);
  assertClose(streakAdjustedApprox(49, head), 1 - Math.pow(49 / 50, 49));
  assertClose(streakAdjustedApprox(50, head), 1);
  assertClose(streakAdjustedApprox(80, head), 1);
});

Deno.test("pity_ramp: rate climbs linearly, then holds", () => {
  const thread = rate({
    distribution_type: "streak_adjusted",
    denominator: 10,
    metadata: {
      pity_ramp: { start_denominator: 10, end_denominator: 10 / 3, ramp_kc: 15 },
    },
  });
  const chanceAt = (kcBefore: number) => 0.1 + 0.2 * Math.min(kcBefore, 15) / 15;
  const bruteForce = (kc: number) => {
    let survival = 1;
    for (let i = 0; i < kc; i++) survival *= 1 - chanceAt(i);
    return 1 - survival;
  };

  assertClose(streakAdjustedApprox(0, thread), 0);
  assertClose(streakAdjustedApprox(1, thread), 0.1);
  for (const kc of [2, 15, 16, 17, 40]) {
    assertClose(streakAdjustedApprox(kc, thread), bruteForce(kc));
  }
});

Deno.test("backfilled drops never get a probability", () => {
  const result = calculateLuck(
    drop({ is_backfilled: true, kc_received: null }),
    rate({ distribution_type: "points_based" }),
  );
  assert(result.backfilled && !result.supported, "backfilled flags wrong");
  assert(Number.isNaN(result.probability), "probability should be NaN");
});

function binomialPmf(n: number, p: number, k: number) {
  let c = 1;
  for (let i = 0; i < k; i++) c = (c * (n - i)) / (i + 1);
  return c * Math.pow(p, k) * Math.pow(1 - p, n - k);
}

Deno.test("snapshotLuck is the binomial mid-p over kc * rolls_per_kill", () => {
  // 5 kills at 2 rolls each, 1/10 per roll, 2 copies.
  const r = rate({ denominator: 10, rolls_per_kill: 2 });
  const below = binomialPmf(10, 0.1, 0) + binomialPmf(10, 0.1, 1);
  const expected = 1 - below - binomialPmf(10, 0.1, 2) / 2;
  assertClose(snapshotLuck(5, 2, r)!.probability, expected, 1e-12);
});

Deno.test("snapshotLuck: 200 Barrows chests, one piece is average, two is spooned", () => {
  const piece = rate({ denominator: 2448, rolls_per_kill: 7 });
  const one = snapshotLuck(200, 1, piece)!;
  const two = snapshotLuck(200, 2, piece)!;
  assert(one.label === "average", `one piece: ${one.probability}`);
  assert(two.label === "spooned", `two pieces: ${two.probability}`);
  assert(one.kc === 200 && one.quantity === 1, "echoes the snapshot");
});

Deno.test("snapshotLuck averages 0.5 for a fair player", () => {
  // The mid-p score's expectation under the null is exactly one half,
  // the property that lets labelFor's thresholds carry over.
  const r = rate({ denominator: 20 });
  const n = 60;
  let mean = 0;
  for (let k = 1; k <= n; k++) mean += binomialPmf(n, 1 / 20, k) * snapshotLuck(n, k, r)!.probability;
  // k = 0 isn't a backfilled item; its score is 1 - P(X=0)/2.
  const zero = binomialPmf(n, 1 / 20, 0);
  mean += zero * (1 - zero / 2);
  assertClose(mean, 0.5, 1e-9);
});

Deno.test("snapshotLuck doesn't underflow on a long grind", () => {
  const s = snapshotLuck(100_000, 1, rate({ denominator: 512 }))!;
  assert(Number.isFinite(s.probability) && s.label === "desert", `got ${s.probability}`);
});

Deno.test("snapshotLuck only rates flat rates with a sane count", () => {
  assert(snapshotLuck(100, 1, rate({ distribution_type: "points_based" })) === null, "points_based");
  assert(snapshotLuck(100, 1, rate({ distribution_type: "streak_adjusted" })) === null, "streak_adjusted");
  assert(snapshotLuck(0, 1, rate({})) === null, "no kills");
  assert(snapshotLuck(3, 4, rate({})) === null, "more copies than rolls");
});

Deno.test("a backfilled drop's snapshot stays out of probability", () => {
  const withSnapshot = calculateLuck(
    drop({ is_backfilled: true, kc_received: null, snapshot_kc: 150, snapshot_quantity: 1 }),
    rate({ denominator: 100 }),
  );
  assert(Number.isNaN(withSnapshot.probability), "probability stays NaN");
  assert(withSnapshot.backfilled && !withSnapshot.supported, "still backfilled");
  assert(withSnapshot.snapshot?.kc === 150, "snapshot attached");

  const without = calculateLuck(drop({ is_backfilled: true, kc_received: null }), rate({}));
  assert(without.snapshot === undefined, "no snapshot without the columns");
});

Deno.test("streak_adjusted uses kills since the previous drop", () => {
  const head = rate({
    distribution_type: "streak_adjusted",
    denominator: 50,
    metadata: {
      pity_thresholds: [{ kc: 49, denominator: 50 }, { kc: 50, denominator: 1 }],
    },
  });
  const result = calculateLuck(drop({ kc_received: 120, kc_at_previous_drop: 20 }), head);
  assertClose(result.probability, streakAdjustedApprox(20, head));
  assert(result.estimated, "streak_adjusted should be flagged estimated");
});

Deno.test("manual_drop_rates.json rows are well formed", async () => {
  const url = new URL("../../../data/manual_drop_rates.json", import.meta.url);
  const { rows } = JSON.parse(await Deno.readTextFile(url));
  const seen = new Set<string>();

  for (const row of rows) {
    const key = `${row.item_id}|${row.source_name}`;
    assert(!seen.has(key), `duplicate row ${key}`);
    seen.add(key);
    assert(Number.isInteger(row.item_id) && row.item_id > 0, `bad item_id ${key}`);
    assert(Number.isInteger(row.numerator) && row.numerator > 0, `bad numerator ${key}`);
    assert(Number.isInteger(row.denominator) && row.denominator > 0, `bad denominator ${key}`);
    assert(row.numerator <= row.denominator, `rate above 1 for ${key}`);

    const m = row.metadata;
    if (row.distribution_type === "points_based") {
      assert(m.avg_points_per_activity > 0 && m.points_per_roll > 0, `points metadata missing for ${key}`);
    }
    if (row.distribution_type === "streak_adjusted") {
      assert(Boolean(m.pity_ramp || m.pity_thresholds), `pity curve missing for ${key}`);
    }
    if (row.distribution_type !== "flat_geometric") {
      assert(typeof m.assumption === "string" && m.assumption.length > 0, `assumption missing for ${key}`);
    }

    let previous = 0;
    for (const kc of [1, 10, 50, 300, 2000]) {
      const p = calculateLuck(drop({ kc_received: kc, kc_at_previous_drop: kc }), row).probability;
      assert(p >= previous && p <= 1, `probability out of order for ${key} at kc ${kc}: ${p}`);
      previous = p;
    }
  }
});
