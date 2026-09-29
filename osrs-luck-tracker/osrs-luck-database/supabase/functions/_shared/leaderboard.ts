// supabase/functions/_shared/leaderboard.ts
//
// Player-level ranking for /leaderboard. A player's score starts from the
// average probability P across their rated drops (supported, not
// backfilled), the same P the profile page shows per drop: under fair luck
// it averages about 50%, so lower is luckier. They're ranked by how
// unlikely that average is for their number of drops (averageDropPercentile),
// so 30% over 50 drops beats 20% over 3.

import { summarizePlayerLuck } from "./calculations.ts";
import type { LuckResult } from "./types.ts";

// Fewer rated drops than this and one early pet would top the board.
export const MIN_RATED_DROPS = 3;
export const LEADERBOARD_SIZE = 10;

export interface LeaderboardEntry {
  ign: string;
  // A seeded sample account (seed-demo.sql), badged as such on the site.
  demo: boolean;
  rated_drops: number;
  average_probability: number;
  // Chance a fair-luck account with this many rated drops averages this
  // low or lower. The ranking key; lower is luckier.
  percentile: number;
  // The drop that best shows why they're here: their most spooned drop
  // on the luckiest list, their driest on the driest list.
  highlight: LuckResult;
}

export interface Leaderboard {
  min_rated_drops: number;
  luckiest: LeaderboardEntry[];
  driest: LeaderboardEntry[];
}

export const isRated = (r: LuckResult) =>
  r.supported && !r.backfilled && Number.isFinite(r.probability);

// Luckiest holds players below even (average < 0.5, which is percentile
// < 0.5 since the distribution is symmetric), driest those above, so nobody
// is on both lists. Percentiles too extreme to tell apart fall back to the
// average, then to whoever has more rated drops.
export function rankPlayers(
  players: { ign: string; demo?: boolean; results: LuckResult[] }[],
  size = LEADERBOARD_SIZE,
): Leaderboard {
  const scored = players.flatMap(({ ign, demo = false, results }) => {
    const rated = results.filter(isRated);
    if (rated.length < MIN_RATED_DROPS) return [];
    const sum = rated.reduce((s, r) => s + r.probability, 0);
    const average = sum / rated.length;
    const percentile = averageDropPercentile(sum, rated.length);
    const { mostSpooned, driest } = summarizePlayerLuck(rated);
    return [{ ign, demo, rated, average, percentile, mostSpooned: mostSpooned!, driest: driest! }];
  });

  const entry = (p: (typeof scored)[number], highlight: LuckResult): LeaderboardEntry => ({
    ign: p.ign,
    demo: p.demo,
    rated_drops: p.rated.length,
    average_probability: p.average,
    percentile: p.percentile,
    highlight,
  });

  const luckiest = scored
    .filter((p) => p.average < 0.5)
    .sort((a, b) => a.percentile - b.percentile || a.average - b.average || b.rated.length - a.rated.length)
    .slice(0, size)
    .map((p) => entry(p, p.mostSpooned));

  const driest = scored
    .filter((p) => p.average > 0.5)
    .sort((a, b) => b.percentile - a.percentile || b.average - a.average || b.rated.length - a.rated.length)
    .slice(0, size)
    .map((p) => entry(p, p.driest));

  return { min_rated_drops: MIN_RATED_DROPS, luckiest, driest };
}

// With fair luck each drop's P is (roughly) uniform on [0, 1], so the sum
// of n of them follows the Irwin–Hall distribution. Its exact CDF is an
// alternating sum that loses precision as n grows; past that point the
// normal approximation (mean n/2, variance n/12) is already very close.
// Mirrored for the site in lib/overall.ts.
const EXACT_MAX_N = 20;

export function averageDropPercentile(sum: number, n: number): number {
  if (sum <= 0) return 0;
  if (sum >= n) return 1;
  if (n > EXACT_MAX_N) return normalCdf((sum - n / 2) / Math.sqrt(n / 12));
  let total = 0;
  let binom = 1; // C(n, k)
  let factorial = 1; // n!
  for (let i = 2; i <= n; i++) factorial *= i;
  for (let k = 0; k <= Math.floor(sum); k++) {
    total += (k % 2 === 0 ? 1 : -1) * binom * (sum - k) ** n;
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
