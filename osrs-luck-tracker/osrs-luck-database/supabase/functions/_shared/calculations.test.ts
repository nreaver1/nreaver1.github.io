// Run from osrs-luck-database/:
//   npx deno test --no-config --allow-read supabase/functions/_shared/

import {
  calculateLuck,
  geometricCDF,
  pointsBasedApprox,
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
