// supabase/functions/_shared/leaderboard.ts
//
// Player-level ranking for /leaderboard. A player's score is the average
// probability P across their rated drops (supported, not backfilled), the
// same P the profile page shows per drop: under fair luck it averages
// about 50%, so lower is luckier.

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

// Luckiest holds players below even (average < 0.5), driest those above,
// so nobody is on both lists. Ties go to whoever has more rated drops.
export function rankPlayers(
  players: { ign: string; demo?: boolean; results: LuckResult[] }[],
  size = LEADERBOARD_SIZE,
): Leaderboard {
  const scored = players.flatMap(({ ign, demo = false, results }) => {
    const rated = results.filter(isRated);
    if (rated.length < MIN_RATED_DROPS) return [];
    const average = rated.reduce((sum, r) => sum + r.probability, 0) / rated.length;
    const { mostSpooned, driest } = summarizePlayerLuck(rated);
    return [{ ign, demo, rated, average, mostSpooned: mostSpooned!, driest: driest! }];
  });

  const entry = (p: (typeof scored)[number], highlight: LuckResult): LeaderboardEntry => ({
    ign: p.ign,
    demo: p.demo,
    rated_drops: p.rated.length,
    average_probability: p.average,
    highlight,
  });

  const luckiest = scored
    .filter((p) => p.average < 0.5)
    .sort((a, b) => a.average - b.average || b.rated.length - a.rated.length)
    .slice(0, size)
    .map((p) => entry(p, p.mostSpooned));

  const driest = scored
    .filter((p) => p.average > 0.5)
    .sort((a, b) => b.average - a.average || b.rated.length - a.rated.length)
    .slice(0, size)
    .map((p) => entry(p, p.driest));

  return { min_rated_drops: MIN_RATED_DROPS, luckiest, driest };
}
