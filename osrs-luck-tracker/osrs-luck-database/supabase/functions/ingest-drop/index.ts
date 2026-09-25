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
import { matchSource } from "../_shared/kc-aliases.ts";
import {
  isAccountHash,
  isInstallToken,
  isItemId,
  isKc,
  isSourceName,
  json,
  rateLimit,
  serverError,
  tokensMatch,
} from "../_shared/http.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = getSecretKey();

const RATE_LIMIT_PER_HOUR = 20;
const MAX_SUBMISSION_LAG_DAYS = 3;
// Per caller IP, covering requests that fail auth or validation too.
const IP_RATE_LIMIT_PER_MINUTE = 60;

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const limited = await rateLimit(supabase, req, "ingest-drop", IP_RATE_LIMIT_PER_MINUTE, 60);
  if (limited) return limited;

  let body: {
    install_token?: unknown;
    account_hash?: unknown;
    item_id?: unknown;
    source_name?: unknown;
    kc_received?: unknown;
    current_kc?: unknown;
    date_received?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const {
    install_token,
    account_hash,
    item_id,
    kc_received,
    current_kc,
  } = body ?? {};

  if (
    !isInstallToken(install_token) || !isAccountHash(account_hash) ||
    !isItemId(item_id) || !isSourceName(body.source_name) ||
    !isKc(kc_received) || !isKc(current_kc)
  ) {
    return json({ error: "Missing or invalid fields" }, 400);
  }

  // --- Auth: token must match account_hash ---
  const { data: player, error: playerError } = await supabase
    .from("players")
    .select("account_hash, install_token")
    .eq("account_hash", account_hash)
    .maybeSingle();

  if (playerError) return serverError("ingest-drop: player lookup failed", playerError);
  if (!player || !tokensMatch(player.install_token, install_token)) {
    return json({ error: "Invalid install_token" }, 401);
  }

  // --- Match the chat message's source to a drop_rates source ---
  // The plugin sends the boss name as the kill-count message prints it,
  // which can differ from the collection log page the rate is stored under
  // ("Gauntlet" vs "The Gauntlet", "Dagannoth Rex" vs "Dagannoth Kings").
  // An item with no rate from this source is rejected here rather than by
  // the foreign key.
  const { data: rates, error: ratesError } = await supabase
    .from("drop_rates")
    .select("source_name")
    .eq("item_id", item_id);

  if (ratesError) return serverError("ingest-drop: rate lookup failed", ratesError);
  const sources = (rates ?? []).map((r) => r.source_name as string);
  const source_name = matchSource(body.source_name as string, sources);
  if (!source_name) {
    return json({ error: "No drop rate for this item from this source" }, 422);
  }

  // --- Anti-cheat: kc_received cannot exceed current_kc ---
  if (kc_received > current_kc) {
    return json({ error: "kc_received cannot exceed current_kc" }, 422);
  }

  // --- Anti-cheat: date_received cannot be absurdly stale ---
  if (body.date_received != null && typeof body.date_received !== "string") {
    return json({ error: "Invalid date_received" }, 400);
  }
  const dateReceived = body.date_received
    ? new Date(body.date_received)
    : new Date();
  if (Number.isNaN(dateReceived.getTime())) {
    return json({ error: "Invalid date_received" }, 400);
  }
  const lagDays =
    (Date.now() - dateReceived.getTime()) / (1000 * 60 * 60 * 24);
  if (lagDays > MAX_SUBMISSION_LAG_DAYS || lagDays < -1) {
    return json({ error: "date_received outside acceptable window" }, 422);
  }

  // --- Anti-cheat: rate limit inserts per account_hash ---
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error: countError } = await supabase
    .from("collection_log_drops")
    .select("id", { count: "exact", head: true })
    .eq("account_hash", account_hash)
    .gte("date_submitted", oneHourAgo);

  if (countError) return serverError("ingest-drop: rate count failed", countError);
  if ((count ?? 0) >= RATE_LIMIT_PER_HOUR) {
    return json({ error: "Rate limit exceeded, try again later" }, 429);
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
    if (insertError.code === "23505") {
      return json({ error: "Drop already recorded" }, 409);
    }
    return serverError("ingest-drop: insert failed", insertError);
  }

  return json({ drop: inserted }, 201);
});
