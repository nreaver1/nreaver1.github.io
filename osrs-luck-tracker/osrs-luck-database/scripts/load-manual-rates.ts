/**
 * scripts/load-manual-rates.ts
 *
 * Upserts the hand-curated rows in data/manual_drop_rates.json (raid
 * uniques and pity-timer drops) into `drop_rates`. Safe to re-run: rows
 * are keyed on (item_id, source_name).
 *
 * Like sync-drop-rates.ts this runs standalone, so export the config first:
 *   export SUPABASE_URL=https://<ref>.supabase.co
 *   export SUPABASE_SECRET_KEY=sb_secret_...
 * Run with: deno run --allow-net --allow-env --allow-read scripts/load-manual-rates.ts
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { DistributionType } from "../supabase/functions/_shared/types.ts";

export interface ManualRate {
  item_id: number;
  item_name: string;
  source_name: string;
  distribution_type: DistributionType;
  numerator: number;
  denominator: number;
  rolls_per_kill: number;
  metadata: Record<string, unknown>;
  wiki: string;
}

export async function readManualRates(): Promise<ManualRate[]> {
  const url = new URL("../data/manual_drop_rates.json", import.meta.url);
  const file = JSON.parse(await Deno.readTextFile(url));
  return file.rows as ManualRate[];
}

async function main() {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SECRET_KEY")!,
  );

  const rows = (await readManualRates()).map((r) => ({
    item_id: r.item_id,
    source_name: r.source_name,
    distribution_type: r.distribution_type,
    numerator: r.numerator,
    denominator: r.denominator,
    rolls_per_kill: r.rolls_per_kill,
    metadata: r.metadata,
    source_updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from("drop_rates")
    .upsert(rows, { onConflict: "item_id,source_name" });
  if (error) {
    console.error(`Upsert failed: ${error.message}`);
    Deno.exit(1);
  }
  console.log(`Loaded ${rows.length} manual drop rates.`);
}

if (import.meta.main) {
  main();
}
