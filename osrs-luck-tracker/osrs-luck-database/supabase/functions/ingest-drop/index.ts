// POST /ingest-drop
//
// Called by the RuneLite plugin when a collection log slot is filled.
// Requires a valid install_token (minted by /register). Runs anti-cheat
// sanity checks before inserting.
//
// Body: {
//   install_token: string,
//   account_hash: string,
//   item_id: number,
//   source_name: string,
//   kc_received: number,
//   current_kc: number,          // boss_kc.current_kc at time of drop
//   date_received?: string       // ISO timestamp, defaults to now()
// }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getSecretKey } from "../_shared/secret-key.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = getSecretKey();

const RATE_LIMIT_PER_HOUR = 20;
const MAX_SUBMISSION_LAG_DAYS = 3;

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  let body: {
    install_token?: string;
    account_hash?: string;
    item_id?: number;
    source_name?: string;
    kc_received?: number;
    current_kc?: number;
    date_received?: string;
  };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
    });
  }

  const {
    install_token,
    account_hash,
    item_id,
    kc_received,
    current_kc,
  } = body;

  if (
    !install_token || !account_hash || item_id == null ||
    !body.source_name || kc_received == null || current_kc == null
  ) {
    return new Response(JSON.stringify({ error: "Missing required fields" }), {
      status: 400,
    });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // --- Auth: token must match account_hash ---
  const { data: player, error: playerError } = await supabase
    .from("players")
    .select("account_hash, install_token")
    .eq("account_hash", account_hash)
    .maybeSingle();

  if (playerError) {
    return new Response(JSON.stringify({ error: playerError.message }), {
      status: 500,
    });
  }
  if (!player || player.install_token !== install_token) {
    return new Response(JSON.stringify({ error: "Invalid install_token" }), {
      status: 401,
    });
  }

  // --- Match the chat message's source to a drop_rates source ---
  // The plugin sends the boss name as the kill-count message prints it,
  // which can differ from the wiki page name the rate is stored under
  // ("Gauntlet" vs "The Gauntlet"). An item with no rate from this source
  // is rejected here rather than by the foreign key.
  const { data: rates, error: ratesError } = await supabase
    .from("drop_rates")
    .select("source_name")
    .eq("item_id", item_id);

  if (ratesError) {
    return new Response(JSON.stringify({ error: ratesError.message }), {
      status: 500,
    });
  }
  const sources = (rates ?? []).map((r) => r.source_name as string);
  const source_name = sources.find((s) => s === body.source_name) ??
    sources.find((s) => normalizeSource(s) === normalizeSource(body.source_name!));
  if (!source_name) {
    return new Response(
      JSON.stringify({ error: "No drop rate for this item from this source" }),
      { status: 422 },
    );
  }

  // --- Anti-cheat: kc_received cannot exceed current_kc ---
  if (kc_received > current_kc) {
    return new Response(
      JSON.stringify({
        error: "kc_received cannot exceed current_kc",
      }),
      { status: 422 },
    );
  }

  // --- Anti-cheat: date_received cannot be absurdly stale ---
  const dateReceived = body.date_received
    ? new Date(body.date_received)
    : new Date();
  const lagDays =
    (Date.now() - dateReceived.getTime()) / (1000 * 60 * 60 * 24);
  if (lagDays > MAX_SUBMISSION_LAG_DAYS || lagDays < -1) {
    return new Response(
      JSON.stringify({ error: "date_received outside acceptable window" }),
      { status: 422 },
    );
  }

  // --- Anti-cheat: rate limit inserts per account_hash ---
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error: countError } = await supabase
    .from("collection_log_drops")
    .select("id", { count: "exact", head: true })
    .eq("account_hash", account_hash)
    .gte("date_submitted", oneHourAgo);

  if (countError) {
    return new Response(JSON.stringify({ error: countError.message }), {
      status: 500,
    });
  }
  if ((count ?? 0) >= RATE_LIMIT_PER_HOUR) {
    return new Response(
      JSON.stringify({ error: "Rate limit exceeded, try again later" }),
      { status: 429 },
    );
  }

  // --- Find the previous drop of this item (for kc_at_previous_drop) ---
  const { data: previousDrop } = await supabase
    .from("collection_log_drops")
    .select("kc_received")
    .eq("account_hash", account_hash)
    .eq("item_id", item_id)
    .eq("source_name", source_name)
    .order("kc_received", { ascending: false })
    .limit(1)
    .maybeSingle();

  // --- Upsert current_kc into boss_kc ---
  await supabase.from("boss_kc").upsert(
    {
      account_hash,
      boss_name: source_name,
      current_kc,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "account_hash,boss_name" },
  );

  // --- Insert the drop ---
  const { data: inserted, error: insertError } = await supabase
    .from("collection_log_drops")
    .insert({
      account_hash,
      item_id,
      source_name,
      kc_received,
      kc_at_previous_drop: previousDrop
        ? kc_received - previousDrop.kc_received
        : kc_received,
      date_received: dateReceived.toISOString(),
    })
    .select()
    .single();

  if (insertError) {
    // Unique constraint violation likely means a duplicate submission.
    const status = insertError.code === "23505" ? 409 : 500;
    return new Response(JSON.stringify({ error: insertError.message }), {
      status,
    });
  }

  return new Response(JSON.stringify({ drop: inserted }), { status: 201 });
});

// Same rule as the plugin's BackfillPlanner.normalize: ignore case,
// punctuation and a leading "The".
function normalizeSource(name: string): string {
  return name.toLowerCase().replace(/^the\s+/, "").replace(/[^a-z0-9]/g, "");
}
