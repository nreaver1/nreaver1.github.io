// Keeps an account's log page reads (log_pages) and still-hunting rows
// (hunting_items) current between collection log reads, so the site
// doesn't wait for the player to reopen a page:
//
//  - raiseKc: a kill-count message raised a source's kill count
//    (/update-kc, and ingest-drop's current_kc).
//  - recordDropOnPage: a tracked drop landed on a page (ingest-drop).
//
// The next real page read still wins: /sync-hunting overwrites a page
// whose kill count is at least the stored one.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { KC_ALIASES, normalizeSource } from "./kc-aliases.ts";
import { POOLS } from "./pools.ts";

// Pages whose log counter isn't the kill count, so a kill-count message
// can't raise them: Tempoross's page counts reward permits (the plugin's
// LogPageSnapshot.ROLL_COUNTERS).
const PAGE_COUNTER_DIFFERS = new Set(["Tempoross"]);

/**
 * The page a kill-count name raises, out of `sources`: an exact or
 * normalized match, or an alias that's the only one pointing at its page.
 * Pages several bosses' counts map to (Dagannoth Kings, Royal Titans, the
 * wilderness pairs) are left to real reads, since no one count is theirs.
 */
export function pageSourceForKc(kcName: string, sources: string[]): string | undefined {
  const direct = sources.find((s) => s === kcName) ??
    sources.find((s) => normalizeSource(s) === normalizeSource(kcName));
  const source = direct ?? (() => {
    const alias = Object.entries(KC_ALIASES).find(([kc]) => normalizeSource(kc) === normalizeSource(kcName))?.[1];
    if (alias === undefined) return undefined;
    const sharers = Object.values(KC_ALIASES).filter((target) => target === alias).length;
    return sharers === 1 ? sources.find((s) => s === alias) : undefined;
  })();
  return source && !PAGE_COUNTER_DIFFERS.has(source) ? source : undefined;
}

/** Raises the page read's and hunting rows' kill count for one source. Returns an error, if any. */
export async function raiseKc(
  supabase: SupabaseClient,
  accountHash: string,
  source: string,
  kc: number,
): Promise<unknown> {
  const now = new Date().toISOString();
  const { error: pageError } = await supabase
    .from("log_pages")
    .update({ kc, updated_at: now })
    .eq("account_hash", accountHash)
    .eq("source_name", source)
    .lt("kc", kc);
  if (pageError) return pageError;
  const { error: huntingError } = await supabase
    .from("hunting_items")
    .update({ kc, updated_at: now })
    .eq("account_hash", accountHash)
    .eq("source_name", source)
    .lt("kc", kc);
  return huntingError ?? null;
}

/**
 * A tracked drop of `itemId` from `source`: marks it obtained on the
 * stored page read (counting the copy for a pooled item, whose pages are
 * all non-stackable), and ends the hunt for it. Returns an error, if any.
 */
export async function recordDropOnPage(
  supabase: SupabaseClient,
  accountHash: string,
  itemId: number,
  source: string,
): Promise<unknown> {
  const { error: huntError } = await supabase
    .from("hunting_items")
    .delete()
    .eq("account_hash", accountHash)
    .eq("item_id", itemId)
    .eq("source_name", source);
  if (huntError) return huntError;

  const { data: page, error: readError } = await supabase
    .from("log_pages")
    .select("obtained, quantities")
    .eq("account_hash", accountHash)
    .eq("source_name", source)
    .maybeSingle();
  if (readError || !page) return readError ?? null;

  const obtained = new Set<number>(page.obtained ?? []);
  obtained.add(itemId);
  const quantities: Record<string, number> = { ...(page.quantities ?? {}) };
  if (POOLS[source]?.includes(itemId)) {
    quantities[String(itemId)] = (quantities[String(itemId)] ?? 0) + 1;
  }
  const { error: writeError } = await supabase
    .from("log_pages")
    .update({ obtained: [...obtained].sort((a, b) => a - b), quantities, updated_at: new Date().toISOString() })
    .eq("account_hash", accountHash)
    .eq("source_name", source);
  return writeError ?? null;
}
