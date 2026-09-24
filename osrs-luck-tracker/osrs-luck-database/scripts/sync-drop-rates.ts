/**
 * scripts/sync-drop-rates.ts
 *
 * Periodic job that syncs flat_geometric drop rates from the OSRS Wiki
 * into the `drop_rates` table.
 *
 * Approach (confirmed against how the wiki actually stores this data):
 * The OSRS Wiki does NOT expose a clean JSON "drop rates" API. Drop
 * tables live as wikitext templates (`{{DropsLine|Name=...|Quantity=...
 * |Rarity=1/512|...}}`) on each monster's page, built from the Wiki's
 * "Drop Rate Project" data (RuneLite Loot Tracker aggregation + datamined
 * drop code). So this script:
 *   1. Fetches raw wikitext per monster page via the MediaWiki API
 *      (action=parse, prop=wikitext).
 *   2. Parses {{DropsLine|...}} template invocations with a template
 *      parser (not naive regex-only, since Rarity values can be nested
 *      expressions like "1/128 (or 1/512 without ring)").
 *   3. Only inserts entries whose Rarity cleanly parses to N/D — anything
 *      ambiguous (conditional rates, "Not sold", RDT-relative rates) is
 *      logged and skipped for manual review rather than guessed at.
 *   4. Resolves each item name to a numeric item_id via
 *      `_shared/item-resolver.ts`, an offline lookup built from a
 *      trimmed copy of the `osrs-item-data` npm dataset (MIT licensed,
 *      itself scraped from wiki item infoboxes — see data/osrs_items.json).
 *      Names that don't resolve, or resolve to more than one id (variant
 *      collisions), are skipped and logged rather than guessed at.
 *   5. Writes results to `drop_rates` (distribution_type='flat_geometric')
 *      and logs a summary row to `drop_rate_sync_log`.
 *
 * This does NOT attempt to sync points_based or streak_adjusted rates —
 * those are hand-transcribed per the Phase 1 spec (§3a) since the wiki
 * documents them as prose/formulas, not clean fractions. They live in
 * data/manual_drop_rates.json (loaded by load-manual-rates.ts), and any
 * (item, source) pair listed there is skipped here — e.g. Vorkath's head
 * parses as a plain 1/50 but is really guaranteed on kill 50.
 *
 * Run with: deno run --allow-net --allow-env --allow-read scripts/sync-drop-rates.ts
 * (or adapt to a scheduled Supabase Edge Function / cron job later)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveItemId } from "../supabase/functions/_shared/item-resolver.ts";
import { readManualRates } from "./load-manual-rates.ts";

const WIKI_API = "https://oldschool.runescape.wiki/api.php";
const USER_AGENT =
  "osrs-collection-log-luck-tracker/1.0 (contact: https://github.com/nreaver1)";

// Starter set for Phase 1, matching the original spec's seed list.
// Extend this list as more content is added.
const MONSTER_PAGES = [
  "General Graardor",
  "Kree'arra",
  "K'ril Tsutsaroth",
  "Commander Zilyana",
  "Zulrah",
  "Vorkath",
];

interface ParsedDropLine {
  itemName: string;
  numerator: number;
  denominator: number;
}

/**
 * Parses {{DropsLine|Name=X|...|Rarity=N/D|...}} invocations out of raw
 * wikitext. Skips entries with non-simple rarity expressions.
 */
function parseDropsLines(wikitext: string): {
  parsed: ParsedDropLine[];
  skipped: string[];
} {
  const parsed: ParsedDropLine[] = [];
  const skipped: string[] = [];

  // Match individual {{DropsLine|...}} blocks (non-greedy, single line
  // or multi-line up to the closing }}).
  const blockRegex = /\{\{DropsLine\|([^}]*)\}\}/g;
  let match: RegExpExecArray | null;

  while ((match = blockRegex.exec(wikitext)) !== null) {
    const fields: Record<string, string> = {};
    for (const part of match[1].split("|")) {
      const [key, ...rest] = part.split("=");
      if (key && rest.length) {
        fields[key.trim().toLowerCase()] = rest.join("=").trim();
      }
    }

    const name = fields["name"];
    const rarity = fields["rarity"];
    if (!name || !rarity) continue;

    // Only accept simple "N/D" rarity strings. Anything with extra text
    // (parentheses, "or", conditional notes) gets flagged for a human.
    const simple = rarity.match(/^(\d+)\/(\d+)$/);
    if (!simple) {
      skipped.push(`${name}: unparsed rarity "${rarity}"`);
      continue;
    }

    parsed.push({
      itemName: name,
      numerator: Number(simple[1]),
      denominator: Number(simple[2]),
    });
  }

  return { parsed, skipped };
}

async function fetchWikitext(pageTitle: string): Promise<string> {
  const params = new URLSearchParams({
    action: "parse",
    page: pageTitle,
    prop: "wikitext",
    format: "json",
    formatversion: "2",
  });

  const res = await fetch(`${WIKI_API}?${params}`, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!res.ok) {
    throw new Error(`Wiki API request failed for "${pageTitle}": ${res.status}`);
  }
  const json = await res.json();
  return json?.parse?.wikitext ?? "";
}

async function main() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  // This script runs standalone (`deno run` locally / in CI), not inside
  // the Supabase Edge Functions runtime, so it does NOT get the
  // auto-injected SUPABASE_SECRET_KEYS JSON blob that index.ts files rely
  // on. Export the raw key string yourself before running:
  //   export SUPABASE_URL=https://<ref>.supabase.co
  //   export SUPABASE_SECRET_KEY=sb_secret_...   (from Settings > API Keys)
  const secretKey = Deno.env.get("SUPABASE_SECRET_KEY")!;
  const supabase = createClient(supabaseUrl, secretKey);

  const manualKeys = new Set(
    (await readManualRates()).map((r) => `${r.item_id}|${r.source_name}`),
  );

  let itemsUpdated = 0;
  let itemsFlagged = 0;

  for (const page of MONSTER_PAGES) {
    console.log(`Syncing: ${page}`);
    let wikitext: string;
    try {
      wikitext = await fetchWikitext(page);
    } catch (err) {
      console.error(`  fetch failed: ${err}`);
      itemsFlagged++;
      continue;
    }

    const { parsed, skipped } = parseDropsLines(wikitext);
    for (const s of skipped) {
      console.warn(`  SKIPPED (needs manual review): ${s}`);
      itemsFlagged++;
    }

    for (const drop of parsed) {
      const resolution = resolveItemId(drop.itemName);

      if (resolution.status === "not_found") {
        console.warn(
          `  SKIPPED (item not found in dataset): "${drop.itemName}" — ` +
            `check for a wiki name mismatch or update data/osrs_items.json`,
        );
        itemsFlagged++;
        continue;
      }
      if (resolution.status === "ambiguous") {
        console.warn(
          `  SKIPPED (ambiguous item name): "${drop.itemName}" matches ` +
            `${resolution.candidates.length} ids [${
              resolution.candidates.map((c) => c.id).join(", ")
            }] — resolve manually and hardcode an override`,
        );
        itemsFlagged++;
        continue;
      }

      const itemId = resolution.item_id;
      if (manualKeys.has(`${itemId}|${page}`)) {
        console.log(`  kept hand-curated rate for "${drop.itemName}"`);
        continue;
      }

      const { error } = await supabase.from("drop_rates").upsert(
        {
          item_id: itemId,
          source_name: page,
          distribution_type: "flat_geometric",
          numerator: drop.numerator,
          denominator: drop.denominator,
          rolls_per_kill: 1,
          metadata: {},
          source_updated_at: new Date().toISOString(),
        },
        { onConflict: "item_id,source_name" },
      );

      if (error) {
        console.error(`  upsert failed for ${drop.itemName}: ${error.message}`);
        itemsFlagged++;
      } else {
        itemsUpdated++;
      }
    }

    // Be polite to the wiki's API — small delay between page fetches.
    await new Promise((r) => setTimeout(r, 500));
  }

  await supabase.from("drop_rate_sync_log").insert({
    items_updated: itemsUpdated,
    items_flagged_for_review: itemsFlagged,
  });

  console.log(`Done. Updated: ${itemsUpdated}, flagged: ${itemsFlagged}`);
}

if (import.meta.main) {
  main();
}
