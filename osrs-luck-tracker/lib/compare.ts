import type { LuckResult, PlayerLuckResponse } from "./types";

// Primary player plus up to this many others. Past five columns the
// comparison table stops fitting a laptop screen.
export const MAX_COMPARED = 4;

/**
 * Reads the `vs` query param (repeatable: ?vs=A&vs=B) into a clean list:
 * trimmed, de-duplicated case-insensitively, never containing the
 * primary player, capped at MAX_COMPARED.
 */
export function parseCompared(
  vs: string | string[] | undefined,
  primary: string,
): string[] {
  const raw = vs === undefined ? [] : Array.isArray(vs) ? vs : [vs];
  const seen = new Set([primary.trim().toLowerCase()]);
  const out: string[] = [];
  for (const name of raw) {
    const trimmed = name.trim();
    const key = trimmed.toLowerCase();
    if (!trimmed || seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
    if (out.length === MAX_COMPARED) break;
  }
  return out;
}

export function playerHref(primary: string, compared: string[] = []): string {
  const base = `/player/${encodeURIComponent(primary)}`;
  if (compared.length === 0) return base;
  const qs = new URLSearchParams();
  for (const name of compared) qs.append("vs", name);
  return `${base}?${qs.toString()}`;
}

export interface ComparisonRow {
  key: string;
  item_id: number;
  item_name: string;
  source_name: string;
  /** One entry per player, in the same order as the players passed in; null = not logged. */
  cells: (LuckResult | null)[];
  /**
   * Parallel to `cells`: true for the player who needed the least luck
   * (lowest probability) for this drop. Only set when at least two players
   * have a rated result, and every player tied for lowest is marked.
   */
  luckiest: boolean[];
}

// Backfilled and unsupported results have no meaningful probability, so
// they can never win (or lose) a comparison.
function isRated(r: LuckResult | null): r is LuckResult {
  return r !== null && r.supported && !r.backfilled && Number.isFinite(r.probability);
}

function markLuckiest(cells: (LuckResult | null)[]): boolean[] {
  const rated = cells.filter(isRated);
  if (rated.length < 2) return cells.map(() => false);
  const best = Math.min(...rated.map((r) => r.probability));
  return cells.map((r) => isRated(r) && r.probability === best);
}

/**
 * Pivots each player's results into one row per (item, source), so the
 * same drop lines up across players. Rows that more players share come
 * first (that's what people compare), then by source and item name.
 */
export function buildComparisonRows(players: PlayerLuckResponse[]): ComparisonRow[] {
  const rows = new Map<string, ComparisonRow>();

  players.forEach((player, column) => {
    for (const r of player.results) {
      const key = `${r.item_id}::${r.source_name}`;
      let row = rows.get(key);
      if (!row) {
        row = {
          key,
          item_id: r.item_id,
          item_name: r.item_name ?? `Item #${r.item_id}`,
          source_name: r.source_name,
          cells: players.map(() => null),
          luckiest: [],
        };
        rows.set(key, row);
      }
      row.cells[column] = r;
    }
  });

  for (const row of rows.values()) row.luckiest = markLuckiest(row.cells);

  const sharedBy = (row: ComparisonRow) => row.cells.filter(Boolean).length;
  return [...rows.values()].sort(
    (a, b) =>
      sharedBy(b) - sharedBy(a) ||
      a.source_name.localeCompare(b.source_name) ||
      a.item_name.localeCompare(b.item_name),
  );
}
