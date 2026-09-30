// POST /sync-hunting
//
// Records which rated items a player is "still hunting": items whose
// collection log slot is empty on a page the plugin read, with that
// page's kill count (migration 0008). Sent from the plugin's side panel
// alongside the collection log import, never automatically.
//
// Body:
//   { install_token, account_hash,
//     hunting:  [{ item_id, source_name, kc }, ...],   // slot empty at kc kills
//     obtained: [{ item_id, source_name }, ...] }      // slot filled since; drop the row
//
// A hunting row's kc only ever goes up: a lower kc (an older read) is
// ignored rather than overwriting a newer one. Pairs without a drop rate
// are skipped and reported in `unknown`.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getSecretKey } from "../_shared/secret-key.ts";
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

const MAX_ITEMS = 500; // per list, per request; the plugin sends chunks
// Per caller IP, covering requests that fail auth or validation too.
const IP_RATE_LIMIT_PER_MINUTE = 30;

interface Pair {
  item_id: number;
  source_name: string;
}

interface HuntingItem extends Pair {
  kc: number;
}

const pairKey = (d: Pair) => `${d.item_id}|${d.source_name}`;

const isPair = (d: unknown): d is Pair => {
  const r = d as Record<string, unknown> | null;
  return !!r && isItemId(r.item_id) && isSourceName(r.source_name);
};

const isHuntingItem = (d: unknown): d is HuntingItem =>
  isPair(d) && isKc((d as unknown as Record<string, unknown>).kc) && (d as HuntingItem).kc > 0;

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const limited = await rateLimit(supabase, req, "sync-hunting", IP_RATE_LIMIT_PER_MINUTE, 60);
  if (limited) return limited;

  let body: { install_token?: unknown; account_hash?: unknown; hunting?: unknown; obtained?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const { install_token, account_hash } = body ?? {};
  if (!isInstallToken(install_token) || !isAccountHash(account_hash)) {
    return json({ error: "Missing required fields" }, 400);
  }

  const hunting = body.hunting ?? [];
  const obtained = body.obtained ?? [];
  if (!Array.isArray(hunting) || !hunting.every(isHuntingItem)) {
    return json({ error: "hunting must be an array of {item_id, source_name, kc > 0}" }, 400);
  }
  if (!Array.isArray(obtained) || !obtained.every(isPair)) {
    return json({ error: "obtained must be an array of {item_id, source_name}" }, 400);
  }
  if (hunting.length > MAX_ITEMS || obtained.length > MAX_ITEMS) {
    return json({ error: `At most ${MAX_ITEMS} items per list per request` }, 400);
  }
  if (hunting.length === 0 && obtained.length === 0) {
    return json({ error: "Nothing to sync" }, 400);
  }

  // --- Auth: same install_token check as ingest-drop ---
  const { data: player, error: playerError } = await supabase
    .from("players")
    .select("account_hash, install_token")
    .eq("account_hash", account_hash)
    .maybeSingle();

  if (playerError) return serverError("sync-hunting: player lookup failed", playerError);
  if (!player || !tokensMatch(player.install_token, install_token)) {
    return json({ error: "Invalid install_token" }, 401);
  }

  // Dedupe, keeping the highest kc per pair. A pair in both lists was
  // read obtained after being read empty, so obtained wins.
  const obtainedKeys = new Set((obtained as Pair[]).map(pairKey));
  const wanted = new Map<string, HuntingItem>();
  for (const h of hunting as HuntingItem[]) {
    if (obtainedKeys.has(pairKey(h))) continue;
    const prev = wanted.get(pairKey(h));
    if (!prev || h.kc > prev.kc) {
      wanted.set(pairKey(h), { item_id: h.item_id, source_name: h.source_name, kc: h.kc });
    }
  }

  let removed = 0;
  if (obtained.length > 0) {
    // One delete per pair keeps source names out of a PostgREST filter
    // string (they can contain commas and parentheses).
    for (const o of obtained as Pair[]) {
      const { data, error } = await supabase
        .from("hunting_items")
        .delete()
        .eq("account_hash", account_hash)
        .eq("item_id", o.item_id)
        .eq("source_name", o.source_name)
        .select("item_id");
      if (error) return serverError("sync-hunting: delete failed", error);
      removed += data?.length ?? 0;
    }
  }

  if (wanted.size === 0) {
    return json({ upserted: 0, removed, unknown: [] }, 200);
  }

  const itemIds = [...new Set([...wanted.values()].map((h) => h.item_id))];

  const { data: rates, error: ratesError } = await supabase
    .from("drop_rates")
    .select("item_id, source_name")
    .in("item_id", itemIds);
  if (ratesError) return serverError("sync-hunting: rate lookup failed", ratesError);
  const knownPairs = new Set((rates ?? []).map(pairKey));

  const { data: existing, error: existingError } = await supabase
    .from("hunting_items")
    .select("item_id, source_name, kc")
    .eq("account_hash", account_hash)
    .in("item_id", itemIds);
  if (existingError) return serverError("sync-hunting: existing lookup failed", existingError);
  const existingKc = new Map((existing ?? []).map((r) => [pairKey(r), r.kc as number]));

  const unknown = [...wanted.values()].filter((h) => !knownPairs.has(pairKey(h)));
  const rows = [...wanted.values()]
    .filter((h) => knownPairs.has(pairKey(h)))
    .filter((h) => h.kc > (existingKc.get(pairKey(h)) ?? 0))
    .map((h) => ({ account_hash, ...h, updated_at: new Date().toISOString() }));

  if (rows.length > 0) {
    const { error: upsertError } = await supabase
      .from("hunting_items")
      .upsert(rows, { onConflict: "account_hash,item_id,source_name" });
    if (upsertError) return serverError("sync-hunting: upsert failed", upsertError);
  }

  return json({ upserted: rows.length, removed, unknown }, 200);
});
