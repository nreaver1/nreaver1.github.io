// GET /leaderboard
//   Luckiest and driest players overall (see _shared/leaderboard.ts):
//   { min_rated_drops, luckiest: LeaderboardEntry[], driest: LeaderboardEntry[] }
//
// GET /leaderboard?item_id=X&source_name=Y&type=driest_obtained|driest_in_progress
//   Per-item boards from the migration 0001 views. No UI uses these yet.
//
// Only players who turned on both "Show my log on the website" and "Show
// me on the leaderboard" in the plugin are listed (leaderboard_opt_in and
// profile_public). The seeded demo players are opted in so visitors have
// something to look at; each entry says whether it's a demo account.
//
// Returns 501 unless LEADERBOARD_ENABLED=true in the project's edge
// function env vars.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { calculateLuck } from "../_shared/calculations.ts";
import { getSecretKey } from "../_shared/secret-key.ts";
import { isItemId, isSourceName, json, rateLimit, serverError } from "../_shared/http.ts";
import { rankPlayers } from "../_shared/leaderboard.ts";
import { isDemoAccount, pickPlayer } from "../_shared/players.ts";
import type { CollectionLogDrop, DropRate, LuckResult } from "../_shared/types.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = getSecretKey();
const leaderboardEnabled = Deno.env.get("LEADERBOARD_ENABLED") === "true";

// Per caller IP. Like get-player-luck, site traffic arrives from shared
// server IPs, so keep this generous.
const RATE_LIMIT_PER_MINUTE = 300;

// PostgREST caps each response at 1000 rows by default.
const PAGE_SIZE = 1000;
const HASHES_PER_QUERY = 200;

// Explicit column lists: never return account_hash, which is what
// /register used to key tokens on and is kept private.
const COLUMNS = {
  driest_obtained: "item_id, source_name, ign, kc_received, date_received",
  driest_in_progress:
    "item_id, source_name, ign, current_kc, last_drop_kc, current_dry_streak",
} as const;

Deno.serve(async (req) => {
  if (!leaderboardEnabled) {
    return json({ error: "Leaderboards are not yet available." }, 501);
  }

  if (req.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const limited = await rateLimit(supabase, req, "leaderboard", RATE_LIMIT_PER_MINUTE, 60);
  if (limited) return limited;

  const url = new URL(req.url);
  if (!url.searchParams.has("item_id") && !url.searchParams.has("source_name")) {
    try {
      return json(await playerLeaderboard(supabase), 200);
    } catch (err) {
      return serverError("leaderboard: player ranking failed", err);
    }
  }

  const itemId = url.searchParams.get("item_id");
  const sourceName = url.searchParams.get("source_name");
  const type = url.searchParams.get("type") ?? "driest_obtained";

  if (!itemId || !sourceName) {
    return json({ error: "item_id and source_name are required" }, 400);
  }
  if (type !== "driest_obtained" && type !== "driest_in_progress") {
    return json({ error: "Invalid type" }, 400);
  }

  if (!isItemId(Number(itemId)) || !isSourceName(sourceName)) {
    return json({ error: "Invalid item_id or source_name" }, 400);
  }

  const { data, error } = await supabase
    .from(type) // driest_obtained | driest_in_progress view
    .select(COLUMNS[type])
    .eq("item_id", Number(itemId))
    .eq("source_name", sourceName)
    .limit(10);

  if (error) return serverError("leaderboard: query failed", error);

  return json({ type, results: data }, 200);
});

async function playerLeaderboard(supabase: SupabaseClient) {
  const players = (await fetchAll<{ account_hash: string; ign: string; last_updated: string }>(
    (from, to) =>
      supabase
        .from("players")
        .select("account_hash, ign, last_updated")
        .eq("leaderboard_opt_in", true)
        .eq("profile_public", true)
        .order("account_hash")
        .range(from, to),
  ));

  // Two opted-in rows can share an IGN (a name change, or a real player
  // named like a demo one); list only the one a profile lookup by that
  // name would show (_shared/players.ts).
  const byIgn = new Map<string, typeof players>();
  for (const p of players) {
    const key = p.ign.toLowerCase();
    byIgn.set(key, [...(byIgn.get(key) ?? []), p]);
  }
  const listed = [...byIgn.values()].map((rows) => pickPlayer(rows)!);
  if (listed.length === 0) return rankPlayers([]);

  // Chunked so the account_hash filter stays well inside URL limits.
  // Backfilled drops have no luck, so skip them here rather than after.
  const drops: CollectionLogDrop[] = [];
  for (let i = 0; i < listed.length; i += HASHES_PER_QUERY) {
    const hashes = listed.slice(i, i + HASHES_PER_QUERY).map((p) => p.account_hash);
    drops.push(...await fetchAll<CollectionLogDrop>((from, to) =>
      supabase
        .from("collection_log_drops")
        .select("*")
        .in("account_hash", hashes)
        .eq("is_backfilled", false)
        .order("id")
        .range(from, to)
    ));
  }

  // Every rate, not just these drops' items: filtering by a long id list
  // would outgrow the request URL, and the table is small reference data.
  const rates = await fetchAll<DropRate>((from, to) =>
    supabase
      .from("drop_rates")
      .select("*")
      .order("item_id")
      .order("source_name")
      .range(from, to)
  );
  const rateMap = new Map<string, DropRate>();
  for (const r of rates) rateMap.set(`${r.item_id}::${r.source_name}`, r);

  const resultsByHash = new Map<string, LuckResult[]>();
  for (const d of drops) {
    const rate = rateMap.get(`${d.item_id}::${d.source_name}`);
    if (!rate) continue;
    resultsByHash.set(d.account_hash, [...(resultsByHash.get(d.account_hash) ?? []), calculateLuck(d, rate)]);
  }

  return rankPlayers(listed.map((p) => ({
    ign: p.ign,
    demo: isDemoAccount(p.account_hash),
    results: resultsByHash.get(p.account_hash) ?? [],
  })));
}

// Reads every page of a query. `page` must apply a stable order.
async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}
