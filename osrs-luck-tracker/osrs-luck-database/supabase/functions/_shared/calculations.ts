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

import type { CollectionLogDrop, DropRate, HuntingResult, HuntingRow, LuckResult, SnapshotLuck } from "./types.ts";

export function labelFor(probability: number): LuckResult["label"] {
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

  // Not floored: at typical raid points one raid is worth a few rolls, so
  // rounding down would throw away a large share of the first raid's chance.
  const equivalentRolls =
    (kcReceived * avgPointsPerActivity) / pointsPerRoll;
  return geometricCDF(equivalentRolls, rate.numerator, rate.denominator, 1);
}

/**
 * Snapshot luck for a backfilled item: the player had `quantity` copies
 * when the log page read `kc` kills. Which kills dropped them is unknown,
 * so this rates the count, not a drop: X ~ Binomial(kc * rolls_per_kill, p)
 * copies for a fair-luck player, and the score is the mid-p value
 *
 *   P(X > k) + P(X = k) / 2
 *
 * High means fewer copies than most players would have (dry), low means
 * more (spooned), and for a fair player it's roughly uniform on 0-1 like
 * geometricCDF's, so labelFor's thresholds mean the same thing. The half
 * term keeps "one copy at high KC" from reading as desert just because
 * P(X >= 1) tends to 1.
 *
 * Flat rates only. Returns null for anything the count can't support:
 * other distribution types (a pity timer resets per drop, raid points
 * aren't per-kill rolls), no kills, or more copies than rolls.
 */
export function snapshotLuck(
  kc: number,
  quantity: number,
  rate: DropRate,
): SnapshotLuck | null {
  if (rate.distribution_type !== "flat_geometric") return null;
  if (!Number.isInteger(kc) || !Number.isInteger(quantity) || kc <= 0 || quantity < 1) {
    return null;
  }
  const trials = kc * rate.rolls_per_kill;
  const p = rate.numerator / rate.denominator;
  const probability = binomialMidP(trials, p, quantity);
  if (probability === null) return null;
  return { kc, quantity, probability, label: labelFor(probability) };
}

/**
 * Mid-p of k successes in `trials` tries at chance p: P(X > k) + P(X = k)/2
 * for X ~ Binomial(trials, p). High means fewer than most fair players
 * would get. Null when k can't happen (more than trials) or p isn't a
 * real chance. Also used for whole-page pools (_shared/pools.ts).
 */
export function binomialMidP(trials: number, p: number, k: number): number | null {
  if (!Number.isInteger(trials) || !Number.isInteger(k) || k < 0 || k > trials) return null;
  if (!(p > 0 && p < 1)) return null;

  // Walk the pmf in log space, since P(X = 0) = (1-p)^n underflows for
  // long grinds.
  const logRatio = Math.log(p) - Math.log1p(-p);
  let logPmf = trials * Math.log1p(-p);
  let below = 0; // P(X < k)
  for (let j = 0; j < k; j++) {
    below += Math.exp(logPmf);
    logPmf += Math.log(trials - j) - Math.log(j + 1) + logRatio;
  }
  const exactly = Math.exp(logPmf); // P(X = k)
  return Math.min(1, Math.max(0, 1 - below - exactly / 2));
}

/**
 * "Still hunting": the player has none of the item after `kc` kills (its
 * collection log slot is empty). Rated like a tracked drop that hasn't
 * happened yet: geometricCDF(kc), the chance a fair player would have had
 * it by now, so high is dry and the labels mean the same as for drops.
 *
 * Flat rates only, for the same reasons as snapshotLuck. Null for other
 * distribution types or no kills.
 */
export function huntingLuck(row: HuntingRow, rate: DropRate): HuntingResult | null {
  if (rate.distribution_type !== "flat_geometric") return null;
  if (!Number.isInteger(row.kc) || row.kc <= 0) return null;
  const probability = geometricCDF(row.kc, rate.numerator, rate.denominator, rate.rolls_per_kill);
  return {
    item_id: row.item_id,
    source_name: row.source_name,
    kc: row.kc,
    probability,
    label: labelFor(probability),
  };
}

export interface PityRamp {
  start_denominator: number;
  end_denominator: number;
  ramp_kc: number;
}

/**
 * Chance of the drop on the kill made at `kcBefore` completed kills, when
 * the per-kill chance rises linearly from numerator/start_denominator at 0
 * kc to numerator/end_denominator at ramp_kc, then holds there.
 */
function rampChance(kcBefore: number, numerator: number, ramp: PityRamp): number {
  const start = numerator / ramp.start_denominator;
  const end = numerator / ramp.end_denominator;
  const progress = Math.min(kcBefore, ramp.ramp_kc) / ramp.ramp_kc;
  return Math.min(1, start + (end - start) * progress);
}

/**
 * streak_adjusted approximation (pity-timer / dry-streak-boosted drops).
 *
 * Reads one of two curve shapes from metadata, checked in this order:
 *  - pity_ramp: { start_denominator, end_denominator, ramp_kc }. The
 *    per-kill chance climbs linearly with kc (e.g. ToA's thread of
 *    Elidinis, 1/10 rising to 3/10 at 15 raids).
 *  - pity_thresholds: [{ kc, denominator }] sorted ascending by kc, a
 *    piecewise-constant curve. Each entry means "from the previous
 *    threshold's kc up to this kc, the rate is numerator/denominator", so a
 *    guaranteed drop on kill N is [{ kc: N-1, denominator: D }, { kc: N,
 *    denominator: 1 }].
 * Falls back to flat geometric if neither has been transcribed.
 */
export function streakAdjustedApprox(
  kcAtPreviousDrop: number,
  rate: DropRate,
): number {
  const ramp = rate.metadata["pity_ramp"] as PityRamp | undefined;
  if (ramp && ramp.start_denominator > 0 && ramp.end_denominator > 0 && ramp.ramp_kc > 0) {
    let survival = 1;
    for (let kc = 0; kc < kcAtPreviousDrop; kc++) {
      survival *= 1 - rampChance(kc, rate.numerator, ramp);
      if (kc >= ramp.ramp_kc) {
        // The rest of the kills all roll at the capped rate.
        const capped = rampChance(ramp.ramp_kc, rate.numerator, ramp);
        survival *= Math.pow(1 - capped, kcAtPreviousDrop - kc - 1);
        break;
      }
    }
    return 1 - survival;
  }

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
    date_received: drop.date_received,
  };

  // Backfilled entries short-circuit before any distribution-type logic
  // runs — there's no kc_received to feed a calculation with, and even
  // if there were, we would not want to. This check comes first,
  // deliberately, so no future change to the switch below can
  // accidentally start computing a probability for one of these. A KC
  // snapshot, if there is one, goes in its own `snapshot` field.
  if (drop.is_backfilled) {
    const snapshot = drop.snapshot_kc != null && drop.snapshot_quantity != null
      ? snapshotLuck(drop.snapshot_kc, drop.snapshot_quantity, rate)
      : null;
    return {
      ...base,
      probability: NaN,
      label: "average",
      estimated: false,
      supported: false,
      backfilled: true,
      ...(snapshot ? { snapshot } : {}),
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
