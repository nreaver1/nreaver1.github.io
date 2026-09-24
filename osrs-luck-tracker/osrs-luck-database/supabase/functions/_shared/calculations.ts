// Luck calculation engine.
//
// Each distribution_type gets its own pure function so behavior stays
// explicit and testable. calculateLuck() dispatches on drop_rates.distribution_type.
//
// v1 status (see phase1_db_and_calc_engine_spec.md §2):
//   flat_geometric    - fully supported
//   points_based      - approximation, flagged `estimated: true`
//   streak_adjusted   - approximation with pity-curve fallback, flagged `estimated: true`
//   multi_roll        - not supported in v1, returns `supported: false`
//   unsupported       - not supported, returns `supported: false`

import type { CollectionLogDrop, DropRate, LuckResult } from "./types.ts";

function labelFor(probability: number): LuckResult["label"] {
  if (probability > 0.99) return "desert";
  if (probability > 0.8) return "dry";
  if (probability < 0.1) return "spooned";
  return "average";
}

/**
 * Geometric CDF: probability that a player would have received the drop
 * by kc_received kills, given an independent per-kill roll of rate p.
 *
 * P = 1 - (1 - p)^kc
 */
export function geometricCDF(
  kcReceived: number,
  numerator: number,
  denominator: number,
  rollsPerKill = 1,
): number {
  if (kcReceived < 0) {
    throw new Error("kcReceived must be >= 0");
  }
  const perRollChance = numerator / denominator;
  const perKillChance = 1 - Math.pow(1 - perRollChance, rollsPerKill);
  return 1 - Math.pow(1 - perKillChance, kcReceived);
}

/**
 * points_based approximation (CoX / ToB / ToA uniques).
 *
 * True calculation requires the actual points-to-chance curve per raid,
 * which is not published as a simple fraction. v1 approximates using the
 * average points earned per raid (from drop_rates.metadata) to convert
 * kc_received into an equivalent "roll count", then applies the geometric
 * CDF. This is a documented approximation, not exact — callers must
 * surface `estimated: true` to the user.
 */
export function pointsBasedApprox(
  kcReceived: number,
  rate: DropRate,
): number {
  const avgPointsPerActivity = Number(
    rate.metadata["avg_points_per_activity"] ?? 0,
  );
  const pointsPerRoll = Number(rate.metadata["points_per_roll"] ?? 0);

  if (!avgPointsPerActivity || !pointsPerRoll) {
    // Metadata not yet transcribed from the wiki — fall back to flat
    // geometric on raw kc_received rather than throwing, but this should
    // be treated as a data-quality gap to fill in, not a correct result.
    return geometricCDF(kcReceived, rate.numerator, rate.denominator);
  }

  const equivalentRolls =
    (kcReceived * avgPointsPerActivity) / pointsPerRoll;
  return geometricCDF(Math.floor(equivalentRolls), rate.numerator, rate.denominator, 1);
}

/**
 * streak_adjusted approximation (pity-timer / dry-streak-boosted drops).
 *
 * Uses metadata.pity_thresholds if present: an array of
 * { kc: number, denominator: number } sorted ascending by kc, describing
 * how the effective rate improves the drier a player gets since their
 * last drop of this item. Falls back to flat geometric if no curve has
 * been transcribed yet.
 */
export function streakAdjustedApprox(
  kcAtPreviousDrop: number,
  rate: DropRate,
): number {
  const thresholds = rate.metadata["pity_thresholds"] as
    | Array<{ kc: number; denominator: number }>
    | undefined;

  if (!thresholds || thresholds.length === 0) {
    return geometricCDF(kcAtPreviousDrop, rate.numerator, rate.denominator);
  }

  // Walk the piecewise-constant rate curve and accumulate survival
  // probability segment by segment.
  const sorted = [...thresholds].sort((a, b) => a.kc - b.kc);
  let survival = 1;
  let previousKc = 0;

  for (const step of sorted) {
    if (kcAtPreviousDrop <= previousKc) break;
    const segmentKc = Math.min(kcAtPreviousDrop, step.kc) - previousKc;
    if (segmentKc > 0) {
      const p = rate.numerator / step.denominator;
      survival *= Math.pow(1 - p, segmentKc);
    }
    previousKc = step.kc;
  }

  if (kcAtPreviousDrop > previousKc) {
    // Beyond the last documented threshold: hold the last known rate.
    const lastDenominator = sorted[sorted.length - 1].denominator;
    const p = rate.numerator / lastDenominator;
    survival *= Math.pow(1 - p, kcAtPreviousDrop - previousKc);
  }

  return 1 - survival;
}

/**
 * Dispatches to the correct calculation for a single drop, given its
 * matching drop_rates row. Returns supported:false rather than a number
 * for distribution types v1 doesn't model, so the caller can hide the
 * luck % in the UI instead of showing a misleading value.
 */
export function calculateLuck(
  drop: CollectionLogDrop,
  rate: DropRate,
): LuckResult {
  const base = {
    item_id: drop.item_id,
    source_name: drop.source_name,
    kc_received: drop.kc_received,
  };

  // Backfilled entries short-circuit before any distribution-type logic
  // runs — there's no kc_received to feed a calculation with, and even
  // if there were, we would not want to. This check comes first,
  // deliberately, so no future change to the switch below can
  // accidentally start computing a probability for one of these.
  if (drop.is_backfilled) {
    return {
      ...base,
      probability: NaN,
      label: "average",
      estimated: false,
      supported: false,
      backfilled: true,
    };
  }

  if (drop.kc_received === null) {
    // Defensive: a non-backfilled row should never have a null
    // kc_received (the DB constraint only allows null when backfilled
    // in practice), but if it somehow happened, fail safe rather than
    // pass null into geometricCDF and get a nonsensical result.
    return {
      ...base,
      probability: NaN,
      label: "average",
      estimated: false,
      supported: false,
      backfilled: false,
    };
  }

  switch (rate.distribution_type) {
    case "flat_geometric": {
      const probability = geometricCDF(
        drop.kc_received,
        rate.numerator,
        rate.denominator,
        rate.rolls_per_kill,
      );
      return {
        ...base,
        probability,
        label: labelFor(probability),
        estimated: false,
        supported: true,
        backfilled: false,
      };
    }
    case "points_based": {
      const probability = pointsBasedApprox(drop.kc_received, rate);
      return {
        ...base,
        probability,
        label: labelFor(probability),
        estimated: true,
        supported: true,
        backfilled: false,
      };
    }
    case "streak_adjusted": {
      const kcSinceLastDrop = drop.kc_at_previous_drop ?? drop.kc_received;
      const probability = streakAdjustedApprox(kcSinceLastDrop, rate);
      return {
        ...base,
        probability,
        label: labelFor(probability),
        estimated: true,
        supported: true,
        backfilled: false,
      };
    }
    case "multi_roll":
    case "unsupported":
    default:
      return {
        ...base,
        probability: NaN,
        label: "average",
        estimated: true,
        supported: false,
        backfilled: false,
      };
  }
}

/**
 * Summarizes a player's full drop set into "most spooned" / "driest"
 * cards for the profile page. Only considers supported, non-estimated-away
 * results — but includes estimated ones (clearly labeled) since excluding
 * them entirely would hide most raid uniques from the summary.
 */
export function summarizePlayerLuck(results: LuckResult[]) {
  const supported = results.filter((r) => r.supported && !Number.isNaN(r.probability));
  if (supported.length === 0) {
    return { mostSpooned: null, driest: null };
  }
  const mostSpooned = supported.reduce((a, b) =>
    a.probability <= b.probability ? a : b
  );
  const driest = supported.reduce((a, b) =>
    a.probability >= b.probability ? a : b
  );
  return { mostSpooned, driest };
}
