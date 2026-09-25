// GET /get-player-luck?ign=Zezima
//
// The v1-priority endpoint: returns a player's full luck breakdown plus
// a most-spooned / driest summary for their profile page. This is the
// only user-facing stats endpoint in this phase — leaderboards are
// built (see migration 0001) but not wired up yet.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { calculateLuck, summarizePlayerLuck } from "../_shared/calculations.ts";
import { getSecretKey } from "../_shared/secret-key.ts";
import { isIgn, json, rateLimit, serverError } from "../_shared/http.ts";
import { pickPlayer } from "../_shared/players.ts";
import type { CollectionLogDrop, DropRate } from "../_shared/types.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = getSecretKey();

// Per caller IP. The site's profile page calls this server-side, so all
// site visitors share Vercel's egress IPs — keep this generous.
const RATE_LIMIT_PER_MINUTE = 300;

// ilike treats _ as a wildcard; match the IGN literally. (isIgn already
// rules out % and backslash.)
const escapeLike = (s: string) => s.replace(/_/g, "\\_");

Deno.serve(async (req) => {
  if (req.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const limited = await rateLimit(supabase, req, "get-player-luck", RATE_LIMIT_PER_MINUTE, 60);
  if (limited) return limited;

  const url = new URL(req.url);
  const ign = url.searchParams.get("ign");
  if (!isIgn(ign)) {
    return json({ error: "Valid ign query param required" }, 400);
  }

  // Several rows can share an IGN (see _shared/players.ts), so fetch them
  // all rather than maybeSingle(), which errors on more than one.
  const { data: candidates, error: playerError } = await supabase
    .from("public_players") // safe view, never exposes install_token
    .select("account_hash, ign, last_updated")
    .ilike("ign", escapeLike(ign))
    .limit(20);

  if (playerError) return serverError("get-player-luck: player lookup failed", playerError);
  const player = pickPlayer(candidates ?? []);
  if (!player) {
    return new Response(JSON.stringify({ error: "Player not found" }), {
      status: 404,
    });
  }

  const { data: drops, error: dropsError } = await supabase
    .from("collection_log_drops")
    .select("*")
    .eq("account_hash", player.account_hash);

  if (dropsError) return serverError("get-player-luck: drops lookup failed", dropsError);

  if (!drops || drops.length === 0) {
    return new Response(
      JSON.stringify({ ign: player.ign, results: [], mostSpooned: null, driest: null }),
      { status: 200 },
    );
  }

  // Batch-fetch drop_rates rows for these items; matched to exact
  // (item_id, source_name) pairs via rateMap below. Filtering by item_id
  // alone avoids building a PostgREST filter string out of source names,
  // which can contain commas and parentheses.
  const itemIds = [...new Set(drops.map((d: CollectionLogDrop) => d.item_id))];
  const { data: rates, error: ratesError } = await supabase
    .from("drop_rates")
    .select("*")
    .in("item_id", itemIds);

  if (ratesError) return serverError("get-player-luck: rate lookup failed", ratesError);

  const rateMap = new Map<string, DropRate>();
  for (const r of rates ?? []) {
    rateMap.set(`${r.item_id}::${r.source_name}`, r);
  }

  const results = drops
    .map((d: CollectionLogDrop) => {
      const rate = rateMap.get(`${d.item_id}::${d.source_name}`);
      if (!rate) return null; // no reference rate yet — skip rather than guess
      return calculateLuck(d, rate);
    })
    .filter((r) => r !== null);

  const { mostSpooned, driest } = summarizePlayerLuck(results as any);

  return new Response(
    JSON.stringify({ ign: player.ign, results, mostSpooned, driest }),
    { status: 200 },
  );
});
