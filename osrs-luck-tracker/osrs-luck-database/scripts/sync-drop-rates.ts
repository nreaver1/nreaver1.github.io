/**
 * scripts/sync-drop-rates.ts
 *
 * Syncs a drop rate for every item on the Bosses and Raids collection log
 * pages into `drop_rates`, so each one can be tracked live, imported from
 * the log, or picked in the plugin's manual backfill dropdown.
 *
 *   1. The log layout (page -> item ids) comes from data/collection_log.json,
 *      dumped from the game cache by scripts/clog-dump. Item ids are the
 *      exact ones the plugin sees, so no name -> id guessing is involved.
 *   2. data/clog_sources.json says which wiki drop tables count for each
 *      page (e.g. Barrows Chests -> "Chest (Barrows)").
 *   3. Rates come from the OSRS Wiki's `dropsline` bucket (the structured
 *      data behind every {{DropsLine}}), queried per wiki page. Unlike the
 *      page wikitext, it includes tables transcluded from templates and
 *      has rarity expressions already evaluated.
 *   4. drop-rate-rules.ts turns those rows into one rate per item. Items
 *      that always drop, or that come from shops and KC milestones rather
 *      than a roll, are reported as untrackable and skipped.
 *
 * Rows in data/manual_drop_rates.json (raid uniques, pity timers) always
 * win: their pairs are skipped here. When a page item only has a manual
 * rate under a mode's source (e.g. Metamorphic dust under Chambers of
 * Xeric Challenge Mode), that row is copied to the page's source too, so
 * the log import can find it.
 *
 * Run (needs SUPABASE_URL and SUPABASE_SECRET_KEY exported, see README):
 *   deno run --allow-net --allow-env --allow-read scripts/sync-drop-rates.ts [--dry-run] [--prune]
 * --dry-run prints the rows and the coverage report without writing.
 * --prune also deletes flat_geometric rows this sync no longer produces
 * (non-log drops like rune items), except ones a player has logged.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import clogLayout from "../data/collection_log.json" with { type: "json" };
import clogSources from "../data/clog_sources.json" with { type: "json" };
import { type ManualRate, readManualRates } from "./load-manual-rates.ts";
import {
  combineIndependent,
  type ItemRate,
  limitDenominator,
  mul,
  perKill,
  rateFromRows,
  rowsForSpec,
  type WikiDrop,
} from "./drop-rate-rules.ts";

const WIKI_API = "https://oldschool.runescape.wiki/api.php";
const USER_AGENT =
  "osrs-collection-log-luck-tracker/1.0 (contact: https://github.com/nreaver1)";
const TRACKED_TABS = new Set(["Bosses", "Raids"]);

type WikiSpec = string | { page: string; via: string };

interface PageConfig {
  source?: string;
  wiki: WikiSpec[];
  variants?: Record<string, string[]>;
  combine?: "independent";
  assumption?: string;
}

interface DropRateRow {
  item_id: number;
  source_name: string;
  distribution_type: string;
  numerator: number;
  denominator: number;
  rolls_per_kill: number;
  metadata: Record<string, unknown>;
}

const pages = (clogSources as { pages: Record<string, PageConfig> }).pages;
const specPage = (s: WikiSpec) => (typeof s === "string" ? s : s.page).split("#")[0];
const normalize = (s: string) =>
  s.toLowerCase().replace(/^the\s+/, "").replace(/[^a-z0-9]/g, "");

async function fetchDrops(page: string): Promise<WikiDrop[]> {
  const query = `bucket("dropsline").select("page_name","item_name","drop_json")` +
    `.where("page_name",${JSON.stringify(page)}).limit(2000).run()`;
  const params = new URLSearchParams({ action: "bucket", format: "json", query });
  const res = await fetch(`${WIKI_API}?${params}`, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`Wiki API request failed for "${page}": ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(`Wiki bucket query failed for "${page}": ${json.error}`);
  return (json.bucket as { page_name: string; drop_json: string }[]).map((row) => {
    const drop = JSON.parse(row.drop_json);
    return {
      page: row.page_name,
      droppedFrom: drop["Dropped from"] ?? row.page_name,
      item: drop["Dropped item"],
      rarity: String(drop["Rarity"] ?? ""),
      rolls: Number(drop["Rolls"]) || 1,
    };
  });
}

/** An item's rate from a list of wiki specs: the first spec that drops it wins. */
function rateFor(item: string, specs: WikiSpec[], drops: WikiDrop[], combine?: string): ItemRate {
  const rates = specs.map((spec) => {
    if (typeof spec === "string") return rateFromRows(rowsForSpec(drops, spec), item);
    const inner = rateFromRows(rowsForSpec(drops, spec.page), item);
    if (inner.kind !== "rate") return inner;
    const via = rateFor(spec.via, specs.filter((s) => typeof s === "string"), drops);
    if (via.kind !== "rate") return { kind: "none" } as ItemRate;
    return {
      kind: "rate",
      value: mul(perKill(via.value, via.rolls), perKill(inner.value, inner.rolls)),
      rolls: 1,
      droppedFrom: `${via.droppedFrom} > ${inner.droppedFrom}`,
    } as ItemRate;
  });
  if (combine === "independent") {
    // Every table on the listed pages is its own roll.
    const tables = [...new Set(drops.filter((d) => specs.some((s) => specPage(s).toLowerCase() === d.page.toLowerCase()))
      .map((d) => d.droppedFrom))];
    return combineIndependent(tables.map((t) => rateFromRows(rowsForSpec(drops, t), item)));
  }
  return rates.find((r) => r.kind !== "none") ?? { kind: "none" };
}

function toRow(itemId: number, source: string, rate: ItemRate & { kind: "rate" }, assumption?: string): DropRateRow {
  const f = limitDenominator(rate.value);
  return {
    item_id: itemId,
    source_name: source,
    distribution_type: "flat_geometric",
    numerator: Number(f.n),
    denominator: Number(f.d),
    rolls_per_kill: rate.rolls,
    metadata: { wiki: rate.droppedFrom, ...(assumption ? { assumption } : {}) },
  };
}

export async function buildRows(manual: ManualRate[]) {
  const manualKeys = new Set(manual.map((r) => `${r.item_id}|${r.source_name}`));
  const layout = (clogLayout as { pages: { tab: string; page: string; items: { id: number; name: string }[] }[] })
    .pages.filter((p) => TRACKED_TABS.has(p.tab));

  const wikiPages = new Set<string>();
  for (const cfg of Object.values(pages)) {
    for (const s of cfg.wiki) wikiPages.add(specPage(s));
    for (const specs of Object.values(cfg.variants ?? {})) specs.forEach((s) => wikiPages.add(specPage(s)));
  }
  const drops: WikiDrop[] = [];
  for (const page of wikiPages) {
    drops.push(...await fetchDrops(page));
    await new Promise((r) => setTimeout(r, 300)); // be polite to the wiki
  }

  const rows: DropRateRow[] = [];
  const untrackable: string[] = [];
  const problems: string[] = [];

  for (const page of layout) {
    const cfg = pages[page.page];
    if (!cfg) {
      problems.push(`${page.page}: no entry in clog_sources.json`);
      continue;
    }
    const source = cfg.source ?? page.page;
    // Manual rows filed under one of this page's modes (CM, HM, Expert, Phosani's).
    const modeSources = new Set([
      ...Object.keys(cfg.variants ?? {}),
      ...manual.map((r) => r.source_name).filter((s) => s !== source && normalize(s).startsWith(normalize(page.page))),
    ]);

    for (const item of page.items) {
      if (manualKeys.has(`${item.id}|${source}`)) continue;
      // A hand-curated mode rate beats the wiki's flat one (which, for
      // raid chests, is usually per unique rather than per raid).
      const modeRow = manual.find((r) => r.item_id === item.id && modeSources.has(r.source_name));
      const rate = rateFor(item.name, cfg.wiki, drops, cfg.combine);
      if (rate.kind === "rate" && !modeRow) {
        rows.push(toRow(item.id, source, rate, cfg.assumption));
        continue;
      }
      if (modeRow) {
        rows.push({
          item_id: item.id,
          source_name: source,
          distribution_type: modeRow.distribution_type,
          numerator: modeRow.numerator,
          denominator: modeRow.denominator,
          rolls_per_kill: modeRow.rolls_per_kill,
          metadata: { ...modeRow.metadata, copied_from: modeRow.source_name },
        });
        continue;
      }
      if (rate.kind === "unparsed") {
        problems.push(`${page.page} / ${item.name}: unparsed rarity ${rate.texts.join(", ")}`);
      } else {
        untrackable.push(`${page.page} / ${item.name}: ${rate.kind === "always" ? "always drops" : "no random drop"}`);
      }
    }

    for (const [variant, specs] of Object.entries(cfg.variants ?? {})) {
      for (const item of page.items) {
        if (manualKeys.has(`${item.id}|${variant}`)) continue;
        const rate = rateFor(item.name, specs, drops);
        if (rate.kind === "rate") rows.push(toRow(item.id, variant, rate, cfg.assumption));
      }
    }
  }
  return { rows, untrackable, problems };
}

async function main() {
  const dryRun = Deno.args.includes("--dry-run");
  const prune = Deno.args.includes("--prune");
  const manual = await readManualRates();
  const { rows, untrackable, problems } = await buildRows(manual);

  for (const u of untrackable) console.log(`  untrackable: ${u}`);
  for (const p of problems) console.warn(`  NEEDS REVIEW: ${p}`);
  console.log(`${rows.length} rows, ${untrackable.length} untrackable, ${problems.length} need review.`);

  if (dryRun) {
    for (const r of rows) {
      console.log(`  ${r.source_name} | ${r.item_id} | ${r.numerator}/${r.denominator} x${r.rolls_per_kill} | ${r.distribution_type}`);
    }
    return;
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SECRET_KEY")!);
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("drop_rates")
    .upsert(rows.map((r) => ({ ...r, source_updated_at: now })), { onConflict: "item_id,source_name" });
  if (error) {
    console.error(`Upsert failed: ${error.message}`);
    Deno.exit(1);
  }

  let pruned = 0;
  if (prune) {
    const keep = new Set([...rows, ...manual].map((r) => `${r.item_id}|${r.source_name}`));
    const { data: existing } = await supabase
      .from("drop_rates").select("item_id, source_name").eq("distribution_type", "flat_geometric");
    const { data: logged } = await supabase.from("collection_log_drops").select("item_id, source_name");
    const used = new Set((logged ?? []).map((r) => `${r.item_id}|${r.source_name}`));
    for (const r of existing ?? []) {
      const key = `${r.item_id}|${r.source_name}`;
      if (keep.has(key) || used.has(key)) continue;
      const { error: delError } = await supabase.from("drop_rates").delete()
        .eq("item_id", r.item_id).eq("source_name", r.source_name);
      if (delError) console.error(`  prune failed for ${key}: ${delError.message}`);
      else pruned++;
    }
  }

  await supabase.from("drop_rate_sync_log").insert({
    items_updated: rows.length,
    items_flagged_for_review: problems.length,
  });
  console.log(`Done. Upserted ${rows.length}${prune ? `, pruned ${pruned}` : ""}.`);
}

if (import.meta.main) {
  main();
}
