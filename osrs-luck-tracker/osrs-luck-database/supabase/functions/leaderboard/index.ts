// GET /leaderboard?item_id=X&source_name=Y&type=driest_obtained|driest_in_progress
//
// STATUS: built per spec (schema + queries exist in migration 0001), but
// intentionally gated off. Per the resolved scope decision, nothing here
// ships publicly until the solo player-stats flow (/get-player-luck +
// profile page) is live. Flip LEADERBOARD_ENABLED to "true" in the
// project's edge function env vars when that's ready — no code change
// or migration needed.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getSecretKey } from "../_shared/secret-key.ts";
import { isItemId, isSourceName, json, rateLimit, serverError } from "../_shared/http.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = getSecretKey();
const leaderboardEnabled = Deno.env.get("LEADERBOARD_ENABLED") === "true";

// Per caller IP. Like get-player-luck, site traffic arrives from shared
// server IPs, so keep this generous.
const RATE_LIMIT_PER_MINUTE = 300;

// Explicit column lists: never return account_hash, which is what
// /register used to key tokens on and is kept private.
const COLUMNS = {
  driest_obtained: "item_id, source_name, ign, kc_received, date_received",
  driest_in_progress:
    "item_id, source_name, ign, current_kc, last_drop_kc, current_dry_streak",
} as const;

Deno.serve(async (req) => {
  if (!leaderboardEnabled) {
    return new Response(
      JSON.stringify({
        error: "Leaderboards are not yet available.",
      }),
      { status: 501 },
    );
  }

  if (req.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const limited = await rateLimit(supabase, req, "leaderboard", RATE_LIMIT_PER_MINUTE, 60);
  if (limited) return limited;

  const url = new URL(req.url);
  const itemId = url.searchParams.get("item_id");
  const sourceName = url.searchParams.get("source_name");
  const type = url.searchParams.get("type") ?? "driest_obtained";

  if (!itemId || !sourceName) {
    return new Response(
      JSON.stringify({ error: "item_id and source_name are required" }),
      { status: 400 },
    );
  }
  if (type !== "driest_obtained" && type !== "driest_in_progress") {
    return new Response(JSON.stringify({ error: "Invalid type" }), {
      status: 400,
    });
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

  return new Response(JSON.stringify({ type, results: data }), {
    status: 200,
  });
});
