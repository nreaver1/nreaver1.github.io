import type { LuckResult } from "./types";

// Mirrors MIN_RATED_DROPS in
// osrs-luck-database/supabase/functions/_shared/leaderboard.ts.
export const MIN_RATED_DROPS = 3;

export const isRated = (r: LuckResult) =>
  r.supported && !r.backfilled && Number.isFinite(r.probability);

export interface OverallLuck {
  ratedDrops: number;
  /** Drops left out: backfilled or not yet supported. */
  unrated: number;
  /** Mean P over rated drops, the number the leaderboard ranks by. */
  average: number;
  /**
   * Chance a fairly lucky account with the same number of rated drops
   * averages this low or lower. Low is lucky, like a single drop's P.
   */
  percentile: number;
}

/** Null when there are fewer than MIN_RATED_DROPS rated drops. */
export function overallLuck(results: LuckResult[]): OverallLuck | null {
  const rated = results.filter(isRated);
  if (rated.length < MIN_RATED_DROPS) return null;
  const sum = rated.reduce((s, r) => s + r.probability, 0);
  return {
    ratedDrops: rated.length,
    unrated: results.length - rated.length,
    average: sum / rated.length,
    percentile: uniformSumCdf(sum, rated.length),
  };
}

// With fair luck each drop's P is (roughly) uniform on [0, 1], so the sum
// of n of them follows the Irwin–Hall distribution. Its exact CDF is an
// alternating sum that loses precision as n grows; past that point the
// normal approximation (mean n/2, variance n/12) is already very close.
const EXACT_MAX_N = 20;

function uniformSumCdf(s: number, n: number): number {
  if (s <= 0) return 0;
  if (s >= n) return 1;
  if (n > EXACT_MAX_N) return normalCdf((s - n / 2) / Math.sqrt(n / 12));
  let total = 0;
  let binom = 1; // C(n, k)
  let factorial = 1; // n!
  for (let i = 2; i <= n; i++) factorial *= i;
  for (let k = 0; k <= Math.floor(s); k++) {
    total += (k % 2 === 0 ? 1 : -1) * binom * (s - k) ** n;
    binom = (binom * (n - k)) / (k + 1);
  }
  return Math.min(1, Math.max(0, total / factorial));
}

// Abramowitz & Stegun 7.1.26 (error under 1.5e-7).
function normalCdf(z: number): number {
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const poly =
    t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const erf = 1 - poly * Math.exp(-x * x);
  return z >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
}
