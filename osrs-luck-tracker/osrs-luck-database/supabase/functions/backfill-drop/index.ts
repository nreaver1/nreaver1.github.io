// POST /backfill-drop
//
// Records items the player already had before installing the plugin.
// Only ever called from an explicit player action in the plugin's side
// panel — either picking one item from the manual dropdown, or
// confirming the "Import from collection log" list, which is built from
// the collection log pages the player opened in-game (see the plugin
// README for exactly what is read and how shared items are excluded).
//
// Body, single item (manual dropdown):
//   { install_token, account_hash, item_id, source_name }
//
// Body, batch (collection log import):
//   { install_token, account_hash, drops: [{ item_id, source_name }, ...] }
//
// Deliberately has NO kc_received field — there is nothing to fill in,
// since this is precisely the "we don't know which kill" case.
//
// Items the account already has a row for (a real tracked drop or an
// earlier backfill) are skipped rather than duplicated. Single mode
// reports that as 409, batch mode counts it in `already_recorded`.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getSecretKey } from "../_shared/secret-key.ts";
import {
  isAccountHash,
  isInstallToken,
  isItemId,
  isSourceName,
  json,
  rateLimit,
  serverError,
  tokensMatch,
} from "../_shared/http.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = getSecretKey();

// Generous — importing a whole log in one sitting is the expected use
// case, this just guards against a runaway loop. The unique index on
// backfilled rows already caps an account at one row per catalog pair.
const RATE_LIMIT_PER_HOUR = 2000;
const MAX_BATCH_SIZE = 500;
// Per caller IP, covering requests that fail auth or validation too.
const IP_RATE_LIMIT_PER_MINUTE = 30;

interface DropKey {
  item_id: number;
  source_name: string;
}

const pairKey = (d: DropKey) => `${d.item_id}|${d.source_name}`;

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const limited = await rateLimit(supabase, req, "backfill-drop", IP_RATE_LIMIT_PER_MINUTE, 60);
  if (limited) return limited;

  let body: {
    install_token?: unknown;
    account_hash?: unknown;
    item_id?: unknown;
    source_name?: unknown;
    drops?: DropKey[];
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const { install_token, account_hash } = body ?? {};
  const isBatch = Array.isArray(body?.drops);

  if (!isInstallToken(install_token) || !isAccountHash(account_hash)) {
    return json({ error: "Missing required fields" }, 400);
  }

  let requested: DropKey[];
  if (isBatch) {
    const valid = body.drops!.every(
      (d) =>
        d && isItemId(d.item_id) && isSourceName(d.source_name),
    );
    if (!valid || body.drops!.length === 0) {
      return json({ error: "drops must be a non-empty array of {item_id, source_name}" }, 400);
    }
    if (body.drops!.length > MAX_BATCH_SIZE) {
      return json({ error: `At most ${MAX_BATCH_SIZE} drops per request` }, 400);
    }
    // Dedupe within the request so one bad client list can't trip the
    // unique index mid-insert.
    const seen = new Map<string, DropKey>();
    for (const d of body.drops!) {
      seen.set(pairKey(d), { item_id: d.item_id, source_name: d.source_name });
    }
    requested = [...seen.values()];
  } else {
    if (!isItemId(body.item_id) || !isSourceName(body.source_name)) {
      return json({ error: "Missing required fields" }, 400);
    }
    requested = [{ item_id: body.item_id, source_name: body.source_name }];
  }

  // --- Auth: same install_token check as ingest-drop ---
  const { data: player, error: playerError } = await supabase
    .from("players")
    .select("account_hash, install_token")
    .eq("account_hash", account_hash)
    .maybeSingle();

  if (playerError) return serverError("backfill-drop: player lookup failed", playerError);
  if (!player || !tokensMatch(player.install_token, install_token)) {
    return json({ error: "Invalid install_token" }, 401);
  }

  const itemIds = [...new Set(requested.map((d) => d.item_id))];

  // --- Only accept item/source pairs that have a known drop rate ---
  // (the table has a foreign key on this anyway, but a clear response
  // beats a raw FK-violation error, and in batch mode one unknown pair
  // shouldn't sink the rest.)
  const { data: rates, error: ratesError } = await supabase
    .from("drop_rates")
    .select("item_id, source_name")
    .in("item_id", itemIds);

  if (ratesError) return serverError("backfill-drop: rate lookup failed", ratesError);
  const knownPairs = new Set((rates ?? []).map(pairKey));

  // --- Skip anything this account already has a row for ---
  const { data: existing, error: existingError } = await supabase
    .from("collection_log_drops")
    .select("item_id, source_name")
    .eq("account_hash", account_hash)
    .in("item_id", itemIds);

  if (existingError) return serverError("backfill-drop: existing lookup failed", existingError);
  const existingPairs = new Set((existing ?? []).map(pairKey));

  const unknown = requested.filter((d) => !knownPairs.has(pairKey(d)));
  const alreadyRecorded = requested.filter(
    (d) => knownPairs.has(pairKey(d)) && existingPairs.has(pairKey(d)),
  );
  const toInsert = requested.filter(
    (d) => knownPairs.has(pairKey(d)) && !existingPairs.has(pairKey(d)),
  );

  if (!isBatch) {
    if (unknown.length > 0) {
      return json({ error: "Unknown item_id/source_name pair" }, 404);
    }
    if (alreadyRecorded.length > 0) {
      return json({ error: "Item already recorded for this account" }, 409);
    }
  }

  if (toInsert.length === 0) {
    return json({ inserted: 0, already_recorded: alreadyRecorded.length, unknown }, 200);
  }

  // --- Rate limit ---
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error: countError } = await supabase
    .from("collection_log_drops")
    .select("id", { count: "exact", head: true })
    .eq("account_hash", account_hash)
    .eq("is_backfilled", true)
    .gte("date_submitted", oneHourAgo);

  if (countError) return serverError("backfill-drop: rate count failed", countError);
  if ((count ?? 0) + toInsert.length > RATE_LIMIT_PER_HOUR) {
    return json({ error: "Rate limit exceeded, try again later" }, 429);
  }

  const rows = toInsert.map((d) => ({
    account_hash,
    item_id: d.item_id,
    source_name: d.source_name,
    kc_received: null,
    is_backfilled: true,
    date_received: null,
  }));

  const { data: inserted, error: insertError } = await supabase
    .from("collection_log_drops")
    .insert(rows)
    .select();

  if (insertError) {
    // Unique violation here means a concurrent request recorded one of
    // these pairs between the existence check above and this insert.
    if (insertError.code === "23505") {
      return json({ error: "Item already recorded for this account" }, 409);
    }
    return serverError("backfill-drop: insert failed", insertError);
  }

  if (!isBatch) {
    return json({ drop: inserted?.[0] }, 201);
  }
  return json(
    { inserted: inserted?.length ?? 0, already_recorded: alreadyRecorded.length, unknown },
    201,
  );
});
