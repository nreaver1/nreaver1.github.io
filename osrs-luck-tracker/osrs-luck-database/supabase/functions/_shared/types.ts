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
  //  - streak_adjusted: { pity_thresholds: Array<{ kc: number, denominator: number }> }
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
}

export interface LuckResult {
  item_id: number;
  source_name: string;
  kc_received: number | null;
  probability: number; // P, 0-1. NaN when backfilled — never display as a number.
  label: "spooned" | "average" | "dry" | "desert";
  estimated: boolean; // true for points_based / streak_adjusted approximations
  supported: boolean; // false for multi_roll / unsupported — don't display P
  backfilled: boolean; // true = "obtained before tracking started, luck unknown" — a
                        // third, distinct state from both a real result and "unsupported"
}
