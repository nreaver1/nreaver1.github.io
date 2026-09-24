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
  results: LuckResult[];
  mostSpooned: LuckResult | null;
  driest: LuckResult | null;
}
