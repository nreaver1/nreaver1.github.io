// Writes a raid completion (/record-raid, and ingest-drop when a raid drop
// carries its raid). The plugin sends each completion once, but a drop can
// arrive with the same raid, so a repeat returns the stored row.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { raiseKc } from "./page-updates.ts";
import { raidRow, type ModeCounts, type RaidRecordInput } from "./raids.ts";

export interface StoredRaid {
  id: string;
  total_kc: number;
  mode_counts: ModeCounts;
}

export async function storeRaid(
  supabase: SupabaseClient,
  accountHash: string,
  record: RaidRecordInput,
): Promise<{ raid: StoredRaid | null; created: boolean; error: unknown }> {
  const row = raidRow(accountHash, record);
  const { data: inserted, error: insertError } = await supabase
    .from("raid_completions")
    .upsert(row, { onConflict: "account_hash,raid,mode,mode_kc", ignoreDuplicates: true })
    .select("id, total_kc, mode_counts");
  if (insertError) return { raid: null, created: false, error: insertError };

  let raid = (inserted ?? [])[0] as StoredRaid | undefined;
  const created = !!raid;
  if (!raid) {
    const { data: existing, error: readError } = await supabase
      .from("raid_completions")
      .select("id, total_kc, mode_counts")
      .eq("account_hash", accountHash)
      .eq("raid", row.raid)
      .eq("mode", row.mode)
      .eq("mode_kc", row.mode_kc)
      .maybeSingle();
    if (readError || !existing) return { raid: null, created: false, error: readError ?? new Error("raid row missing") };
    raid = existing as StoredRaid;
  }

  // The page read's kill count is every mode's total.
  const raiseError = await raiseKc(supabase, accountHash, row.raid, raid.total_kc);
  return { raid, created, error: raiseError };
}
