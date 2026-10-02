export type LuckLabel = "spooned" | "average" | "dry" | "desert";

/**
 * "k copies after N kills" for a backfilled item, read off its collection
 * log page at import. Rates the count, not a drop, so it's always an
 * estimate and never feeds comparisons, the leaderboard or overall luck.
 * Mirrors SnapshotLuck in _shared/types.ts.
 */
export interface SnapshotLuck {
  kc: number;
  quantity: number;
  probability: number; // 0-1, same scale and labels as LuckResult.probability
  label: LuckLabel;
}

export interface LuckResult {
  item_id: number;
  source_name: string;
  kc_received: number | null;
  date_received: string | null; // ISO timestamp; null when backfilled
  probability: number; // 0-1
  label: LuckLabel;
  estimated: boolean;
  supported: boolean;
  backfilled: boolean; // true = "obtained before tracking started, luck unknown"
  snapshot?: SnapshotLuck; // backfilled flat-rate items with a KC snapshot only
  pity?: true; // came on the kill its pity timer guarantees it (Vorkath's head at 50)
  item_name?: string; // resolved client-side or by the API for display
}

/**
 * An item the player's log shows they don't have yet, after `kc` kills of
 * its source. Kept apart from `results`: it never feeds comparisons, the
 * leaderboard or overall luck. Mirrors HuntingResult in _shared/types.ts.
 */
export interface HuntingResult {
  item_id: number;
  source_name: string;
  kc: number;
  /** Chance a fair player would have had the drop by now; high is dry. */
  probability: number;
  label: LuckLabel;
  /** When `kc` last went up; null if unknown. Missing from older APIs. */
  updated_at?: string | null;
  item_name?: string;
}

/** One of a pool's two questions; high `probability` is dry, as everywhere. */
export interface PoolScore {
  count: number;
  expected: number;
  probability: number;
  label: LuckLabel;
}

/**
 * A log page rated as a whole, for pages where many items share one rate
 * (Barrows, Moons of Peril). Mirrors PoolResult in _shared/pools.ts.
 */
export interface PoolResult {
  source_name: string;
  kc: number;
  item_ids: number[];
  obtained_ids: number[];
  quantities: Record<string, number>;
  /** Copies of any pool item. Null when a slot had no quantity to count. */
  total: PoolScore | null;
  /** Different pool items obtained, out of `of`. */
  distinct: PoolScore & { of: number };
  /** Resolved client-side, by item id. */
  item_names?: Record<string, string>;
}

export interface PlayerLuckResponse {
  ign: string;
  /** A seeded sample account (seed-demo.sql), badged as "Demo". */
  demo?: boolean;
  results: LuckResult[];
  /** Driest first. Missing from APIs older than migration 0008. */
  hunting?: HuntingResult[];
  /** Whole-page luck. Missing from APIs older than migration 0009. */
  pools?: PoolResult[];
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
