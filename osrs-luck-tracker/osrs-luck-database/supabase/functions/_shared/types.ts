// Shared types for the OSRS Collection Log Luck Tracker backend.

export type DistributionType =
  | "flat_geometric"
  | "points_based"
  | "streak_adjusted"
  | "multi_roll"
  | "unsupported";

export interface DropRate {
  item_id: number;
  source_name: string;
  distribution_type: DistributionType;
  denominator: number;
  numerator: number;
  rolls_per_kill: number;
  // Type-specific parameters. Shape depends on distribution_type:
  //  - points_based: { avg_points_per_activity: number, points_per_roll: number }
  //  - streak_adjusted: { pity_ramp: { start_denominator, end_denominator, ramp_kc } }
  //                  or { pity_thresholds: Array<{ kc: number, denominator: number }> }
  // Hand-curated rows (data/manual_drop_rates.json) also carry an
  // `assumption` string saying what the numbers are based on.
  metadata: Record<string, unknown>;
  source_updated_at: string;
}

export interface CollectionLogDrop {
  id: string;
  account_hash: string;
  item_id: number;
  source_name: string;
  kc_received: number | null; // null for backfilled entries — see is_backfilled
  kc_at_previous_drop: number | null;
  roll_context: Record<string, unknown> | null;
  date_received: string | null;
  date_submitted: string;
  is_backfilled: boolean;
  // Backfilled rows only, both or neither (migration 0007): the log page's
  // kill count and the item's quantity when the plugin read the page.
  snapshot_kc?: number | null;
  snapshot_quantity?: number | null;
}

// "k copies after N kills", for a backfilled item. Kept apart from
// LuckResult.probability, which stays NaN for backfilled rows, so nothing
// that averages probabilities picks it up by accident.
export interface SnapshotLuck {
  kc: number; // the log page's kill count when it was read
  quantity: number; // copies the log showed then
  probability: number; // mid-p: chance a fair player has more, plus half the chance of exactly as many
  label: "spooned" | "average" | "dry" | "desert";
}

// "N kills and no drop yet" for an item whose log slot is still empty
// (migration 0008). Returned in its own `hunting` list, never mixed into
// `results`, so leaderboard, overall luck and comparisons can't use it.
export interface HuntingResult {
  item_id: number;
  source_name: string;
  kc: number; // the log page's kill count when last read
  probability: number; // chance a fair player would have had the drop by now
  label: "spooned" | "average" | "dry" | "desert";
}

export interface HuntingRow {
  item_id: number;
  source_name: string;
  kc: number;
}

export interface LuckResult {
  item_id: number;
  source_name: string;
  kc_received: number | null;
  date_received: string | null; // ISO timestamp; null for backfilled entries
  probability: number; // P, 0-1. NaN when backfilled — never display as a number.
  label: "spooned" | "average" | "dry" | "desert";
  estimated: boolean; // true for points_based / streak_adjusted approximations
  supported: boolean; // false for multi_roll / unsupported — don't display P
  backfilled: boolean; // true = "obtained before tracking started, luck unknown" — a
                        // third, distinct state from both a real result and "unsupported"
  // Backfilled flat-rate items with a KC snapshot only; see SnapshotLuck.
  snapshot?: SnapshotLuck;
}
