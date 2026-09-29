export type LuckLabel = "spooned" | "average" | "dry" | "desert";

export interface LuckResult {
  item_id: number;
  source_name: string;
  kc_received: number | null;
  probability: number; // 0-1
  label: LuckLabel;
  estimated: boolean;
  supported: boolean;
  backfilled: boolean; // true = "obtained before tracking started, luck unknown"
  item_name?: string; // resolved client-side or by the API for display
}

export interface PlayerLuckResponse {
  ign: string;
  /** A seeded sample account (seed-demo.sql), badged as "Demo". */
  demo?: boolean;
  results: LuckResult[];
  mostSpooned: LuckResult | null;
  driest: LuckResult | null;
}

// Mirrors osrs-luck-database/supabase/functions/_shared/leaderboard.ts.
export interface LeaderboardEntry {
  ign: string;
  demo: boolean;
  rated_drops: number;
  /** Mean probability over the player's rated drops; lower is luckier. */
  average_probability: number;
  /** Chance a fair-luck account with this many drops averages this low;
   * the ranking key, lower is luckier. */
  percentile: number;
  /** Most spooned drop on the luckiest list, driest on the driest list. */
  highlight: LuckResult;
}

export interface LeaderboardResponse {
  min_rated_drops: number;
  luckiest: LeaderboardEntry[];
  driest: LeaderboardEntry[];
}
