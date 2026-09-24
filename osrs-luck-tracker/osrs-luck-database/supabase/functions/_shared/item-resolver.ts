/**
 * supabase/functions/_shared/item-resolver.ts
 *
 * Resolves an item name (as it appears in wiki DropsLine templates, e.g.
 * "Bandos chestplate") to its numeric OSRS item_id.
 *
 * Data source: a trimmed, offline copy of the `osrs-item-data` npm
 * package's dataset (MIT licensed), itself scraped from the OSRS Wiki's
 * item infoboxes. Bundled locally at data/osrs_items.json rather than
 * pulled live, so this resolves without hitting the wiki API per item
 * and can't be broken by wiki formatting drift mid-sync-run.
 *
 * Known data-quality wrinkles this handles explicitly rather than
 * ignoring:
 *   - Variant items are stored with a "#Variant" suffix in `name`
 *     (e.g. "Corrupted tumeken's shadow#Charged") but drop tables
 *     usually reference the base name. We match on `baseName` as a
 *     fallback when a bare name lookup misses.
 *   - ~70 names collide across multiple ids in the raw dataset (recolor
 *     variants, deprecated dupes). Ambiguous matches are NOT silently
 *     resolved to "the first one" — they're returned as ambiguous so
 *     the caller can flag for manual review instead of risking a wrong
 *     item_id landing in drop_rates.
 */

import rawItems from "../../../data/osrs_items.json" with { type: "json" };

interface ItemRecord {
  id: number;
  name: string;
  baseName: string;
}

// Raw dataset entries may have `id` as either a single number or an array
// of numbers (recolor/variant items that share one wiki page and display
// name but map to several distinct item ids — e.g. "Beer glass"). Those
// are expanded into one ItemRecord per id here, so the existing
// duplicate-name detection naturally reports them as `ambiguous` rather
// than the resolver picking an arbitrary id from the array.
interface RawItem {
  id: number | number[] | null;
  name: string;
  baseName: string;
}

const items: ItemRecord[] = (rawItems as RawItem[])
  .filter((raw): raw is RawItem & { id: number | number[] } => raw.id !== null)
  .flatMap((raw) => {
    const ids = Array.isArray(raw.id) ? raw.id : [raw.id];
    return ids.map((id) => ({ id, name: raw.name, baseName: raw.baseName }));
  });

// Build lookup indexes once at module load.
const byExactName = new Map<string, ItemRecord[]>();
const byBaseName = new Map<string, ItemRecord[]>();

for (const item of items) {
  const nameKey = item.name.toLowerCase();
  const baseKey = item.baseName.toLowerCase();

  if (!byExactName.has(nameKey)) byExactName.set(nameKey, []);
  byExactName.get(nameKey)!.push(item);

  if (!byBaseName.has(baseKey)) byBaseName.set(baseKey, []);
  byBaseName.get(baseKey)!.push(item);
}

export type ResolveResult =
  | { status: "resolved"; item_id: number }
  | { status: "not_found" }
  | { status: "ambiguous"; candidates: ItemRecord[] };

/**
 * Resolves a wiki item name to an item_id.
 *
 * Matching order:
 *   1. Exact match on `name` (handles the common case directly).
 *   2. Exact match on `baseName` (handles drop tables that reference
 *      an item without its variant suffix, e.g. charge state).
 *
 * Returns `ambiguous` rather than guessing when more than one record
 * matches at the same tier — callers must treat this the same as
 * `not_found` for write purposes (i.e. skip + log for human review).
 */
export function resolveItemId(itemName: string): ResolveResult {
  const key = itemName.trim().toLowerCase();
  if (!key) return { status: "not_found" };

  const exact = byExactName.get(key);
  if (exact && exact.length === 1) {
    return { status: "resolved", item_id: exact[0].id };
  }
  if (exact && exact.length > 1) {
    return { status: "ambiguous", candidates: exact };
  }

  const base = byBaseName.get(key);
  if (base && base.length === 1) {
    return { status: "resolved", item_id: base[0].id };
  }
  if (base && base.length > 1) {
    return { status: "ambiguous", candidates: base };
  }

  return { status: "not_found" };
}
