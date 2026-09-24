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

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = getSecretKey();
const leaderboardEnabled = Deno.env.get("LEADERBOARD_ENABLED") === "true";

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

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const { data, error } = await supabase
    .from(type) // driest_obtained | driest_in_progress view
    .select("*")
    .eq("item_id", Number(itemId))
    .eq("source_name", sourceName)
    .limit(10);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
    });
  }

  return new Response(JSON.stringify({ type, results: data }), {
    status: 200,
  });
});
