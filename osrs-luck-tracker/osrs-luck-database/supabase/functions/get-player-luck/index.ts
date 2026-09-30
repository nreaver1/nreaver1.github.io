// GET /get-player-luck?ign=Zezima
//   Public profile lookup for the website. A player who turned off "Show
//   my log on the website" in the plugin (players.profile_public = false)
//   gets the same 404 as a name nobody has registered.
//
// POST /get-player-luck  { install_token, account_hash }
//   The plugin reading its own drops, which works whether or not the
//   profile is public.
//
// Both return the player's full luck breakdown plus a most-spooned /
// driest summary for their profile page, and `demo: true` for the seeded
// sample accounts. `hunting` lists rated items the player has none of yet
// (migration 0008), driest first; it's kept apart from `results` so the
// summary and everything built on results never count it. `pools` rates
// whole log pages whose items share one rate (migration 0009,
// _shared/pools.ts); a pooled item then has no per-item snapshot or
// hunting row, since the pool says the same thing once. The POST form
// also returns `log_pages`, the page reads the backend holds, so the
// plugin can send only what changed.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { calculateLuck, huntingLuck, summarizePlayerLuck } from "../_shared/calculations.ts";
import { POOLED_SOURCES, poolsForPage, type LogPage, type PoolResult } from "../_shared/pools.ts";
import { getSecretKey } from "../_shared/secret-key.ts";
import {
  isAccountHash,
  isInstallToken,
  json,
  parseIgn,
  rateLimit,
  serverError,
  tokensMatch,
} from "../_shared/http.ts";
import { isDemoAccount, pickPlayer } from "../_shared/players.ts";
import type { CollectionLogDrop, DropRate, HuntingResult, HuntingRow } from "../_shared/types.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = getSecretKey();

// Per caller IP. The site's profile page calls this server-side, so all
// site visitors share Vercel's egress IPs — keep this generous.
const RATE_LIMIT_PER_MINUTE = 300;

const notFound = () => json({ error: "Player not found" }, 404);

Deno.serve(async (req) => {
  if (req.method !== "GET" && req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const limited = await rateLimit(supabase, req, "get-player-luck", RATE_LIMIT_PER_MINUTE, 60);
  if (limited) return limited;

  let player: { account_hash: string; ign: string };
  const isOwner = req.method === "POST";

  if (req.method === "POST") {
    let body: { install_token?: unknown; account_hash?: unknown };
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }
    const { install_token, account_hash } = body ?? {};
    if (!isInstallToken(install_token) || !isAccountHash(account_hash)) {
      return json({ error: "Valid install_token and account_hash are required" }, 400);
    }

    const { data: owner, error: ownerError } = await supabase
      .from("players")
      .select("account_hash, ign, install_token")
      .eq("account_hash", account_hash)
      .maybeSingle();
    if (ownerError) return serverError("get-player-luck: owner lookup failed", ownerError);
    if (!owner || !tokensMatch(owner.install_token, install_token)) {
      return json({ error: "Invalid install_token" }, 401);
    }
    player = owner;
  } else {
    const url = new URL(req.url);
    // Normalized, so it can't contain ilike wildcards: parseIgn rules out
    // % and backslash and turns _ into a space.
    const ign = parseIgn(url.searchParams.get("ign"));
    if (!ign) {
      return json({ error: "Valid ign query param required" }, 400);
    }

    // Several rows can share an IGN (see _shared/players.ts), so fetch them
    // all rather than maybeSingle(), which errors on more than one.
    const { data: candidates, error: playerError } = await supabase
      .from("public_players") // safe view, never exposes install_token
      .select("account_hash, ign, last_updated, profile_public")
      .ilike("ign", ign)
      .limit(20);

    if (playerError) return serverError("get-player-luck: player lookup failed", playerError);
    // Pick first, then check visibility: a hidden player still owns their
    // name, so the lookup must not fall through to an older row that shares it.
    const picked = pickPlayer(candidates ?? []);
    if (!picked || !picked.profile_public) return notFound();
    player = picked;
  }

  // Seeded sample accounts (seed-demo.sql), badged as such on the site.
  const demo = isDemoAccount(player.account_hash);

  const { data: drops, error: dropsError } = await supabase
    .from("collection_log_drops")
    .select("*")
    .eq("account_hash", player.account_hash);

  if (dropsError) return serverError("get-player-luck: drops lookup failed", dropsError);

  const { data: huntingRows, error: huntingError } = await supabase
    .from("hunting_items")
    .select("item_id, source_name, kc")
    .eq("account_hash", player.account_hash);

  if (huntingError) return serverError("get-player-luck: hunting lookup failed", huntingError);

  const { data: logPages, error: pagesError } = await supabase
    .from("log_pages")
    .select("source_name, kc, obtained, quantities")
    .eq("account_hash", player.account_hash);

  if (pagesError) return serverError("get-player-luck: page lookup failed", pagesError);

  // Owner only: what the backend stores, unfiltered, so the plugin can send
  // just what changed. (`hunting` hides pooled and recorded pairs.)
  const ownerPages = isOwner ? { log_pages: logPages ?? [], hunting_rows: huntingRows ?? [] } : {};

  if ((!drops || drops.length === 0) && (!huntingRows || huntingRows.length === 0) && (!logPages || logPages.length === 0)) {
    return json({ ign: player.ign, demo, results: [], hunting: [], pools: [], mostSpooned: null, driest: null, ...ownerPages }, 200);
  }

  // Batch-fetch drop_rates rows for these items; matched to exact
  // (item_id, source_name) pairs via rateMap below. Filtering by item_id
  // alone avoids building a PostgREST filter string out of source names,
  // which can contain commas and parentheses.
  const itemIds = [
    ...new Set([
      ...(drops ?? []).map((d: CollectionLogDrop) => d.item_id),
      ...(huntingRows ?? []).map((h: HuntingRow) => h.item_id),
    ]),
  ];
  const { data: rates, error: ratesError } = await supabase
    .from("drop_rates")
    .select("*")
    .in("item_id", itemIds);

  if (ratesError) return serverError("get-player-luck: rate lookup failed", ratesError);

  // A pool needs every rate from its source, not just the player's items.
  const pooledPages = (logPages ?? []).filter((p: LogPage) => POOLED_SOURCES.has(p.source_name));
  let poolRates: DropRate[] = [];
  if (pooledPages.length > 0) {
    const { data, error } = await supabase
      .from("drop_rates")
      .select("*")
      .in("source_name", pooledPages.map((p: LogPage) => p.source_name));
    if (error) return serverError("get-player-luck: pool rate lookup failed", error);
    poolRates = data ?? [];
  }
  const pools: PoolResult[] = pooledPages.flatMap((p: LogPage) => poolsForPage(p, poolRates));
  const pooledPairs = new Set(pools.flatMap((p) => p.item_ids.map((id) => `${id}::${p.source_name}`)));

  const rateMap = new Map<string, DropRate>();
  for (const r of rates ?? []) {
    rateMap.set(`${r.item_id}::${r.source_name}`, r);
  }

  const results = (drops ?? [])
    .map((d: CollectionLogDrop) => {
      const rate = rateMap.get(`${d.item_id}::${d.source_name}`);
      if (!rate) return null; // no reference rate yet — skip rather than guess
      const computed = calculateLuck(d, rate);
      // The plugin offers "Add luck estimates" for backfilled rows with no
      // stored snapshot. Whether one is shown isn't the same thing (pooled
      // items hide theirs, non-flat rates never get one), so the owner is
      // told directly.
      const result = isOwner && d.is_backfilled
        ? { ...computed, snapshot_stored: d.snapshot_kc != null }
        : computed;
      if (result.snapshot && pooledPairs.has(`${d.item_id}::${d.source_name}`)) {
        const { snapshot: _pooled, ...rest } = result;
        return rest;
      }
      return result;
    })
    .filter((r) => r !== null);

  const { mostSpooned, driest } = summarizePlayerLuck(results as any);

  // A recorded drop (tracked or backfilled) means the hunt is over, even
  // before the plugin next reads the page and clears the row.
  const recorded = new Set((drops ?? []).map((d: CollectionLogDrop) => `${d.item_id}::${d.source_name}`));
  const hunting = (huntingRows ?? [])
    .filter((h: HuntingRow) => !recorded.has(`${h.item_id}::${h.source_name}`))
    .filter((h: HuntingRow) => !pooledPairs.has(`${h.item_id}::${h.source_name}`))
    .map((h: HuntingRow) => {
      const rate = rateMap.get(`${h.item_id}::${h.source_name}`);
      return rate ? huntingLuck(h, rate) : null;
    })
    .filter((h): h is HuntingResult => h !== null)
    .sort((a, b) => b.probability - a.probability);

  return json({ ign: player.ign, demo, results, hunting, pools, mostSpooned, driest, ...ownerPages }, 200);
});
