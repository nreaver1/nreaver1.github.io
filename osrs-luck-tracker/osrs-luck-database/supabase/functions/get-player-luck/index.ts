// GET /get-player-luck?ign=Zezima
//
// The v1-priority endpoint: returns a player's full luck breakdown plus
// a most-spooned / driest summary for their profile page. This is the
// only user-facing stats endpoint in this phase — leaderboards are
// built (see migration 0001) but not wired up yet.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { calculateLuck, summarizePlayerLuck } from "../_shared/calculations.ts";
import { getSecretKey } from "../_shared/secret-key.ts";
import type { CollectionLogDrop, DropRate } from "../_shared/types.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = getSecretKey();

Deno.serve(async (req) => {
  if (req.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }

  const url = new URL(req.url);
  const ign = url.searchParams.get("ign");
  if (!ign) {
    return new Response(JSON.stringify({ error: "ign query param required" }), {
      status: 400,
    });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: player, error: playerError } = await supabase
    .from("public_players") // safe view, never exposes install_token
    .select("account_hash, ign")
    .ilike("ign", ign)
    .maybeSingle();

  if (playerError) {
    return new Response(JSON.stringify({ error: playerError.message }), {
      status: 500,
    });
  }
  if (!player) {
    return new Response(JSON.stringify({ error: "Player not found" }), {
      status: 404,
    });
  }

  const { data: drops, error: dropsError } = await supabase
    .from("collection_log_drops")
    .select("*")
    .eq("account_hash", player.account_hash);

  if (dropsError) {
    return new Response(JSON.stringify({ error: dropsError.message }), {
      status: 500,
    });
  }

  if (!drops || drops.length === 0) {
    return new Response(
      JSON.stringify({ ign: player.ign, results: [], mostSpooned: null, driest: null }),
      { status: 200 },
    );
  }

  // Batch-fetch matching drop_rates rows.
  const pairs = drops.map((d: CollectionLogDrop) => `(${d.item_id},"${d.source_name}")`);
  const { data: rates, error: ratesError } = await supabase
    .from("drop_rates")
    .select("*")
    .or(
      drops
        .map((d: CollectionLogDrop) => `and(item_id.eq.${d.item_id},source_name.eq.${d.source_name})`)
        .join(","),
    );

  if (ratesError) {
    return new Response(JSON.stringify({ error: ratesError.message }), {
      status: 500,
    });
  }

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
