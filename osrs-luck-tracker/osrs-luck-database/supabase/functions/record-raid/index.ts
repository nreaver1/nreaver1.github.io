// POST /record-raid
//
// One raid completion the plugin saw (migration 0011), sent when the
// raid's result is known: for ToA, once the game sends the player's
// points at the end of the raid. Raid drops are rated over these
// (_shared/raid-luck.ts). Requires a valid install_token.
//
// Body: {
//   install_token, account_hash,
//   raid: {
//     raid: "Tombs of Amascut",
//     mode: "entry" | "normal" | "expert",
//     mode_counts: { entry, normal, expert },   // the game's counts right after this raid
//     team_size?, personal_points?, purple?, purple_mine?,
//     details?: { raid_level },
//     completed_at?: ISO timestamp
//   }
// }
//
// A repeat of a stored completion is accepted and changes nothing.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getSecretKey } from "../_shared/secret-key.ts";
import { isAccountHash, isInstallToken, json, rateLimit, serverError, tokensMatch } from "../_shared/http.ts";
import { parseRaidRecord } from "../_shared/raids.ts";
import { storeRaid } from "../_shared/raid-store.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = getSecretKey();

// Per caller IP, covering requests that fail auth or validation too.
const IP_RATE_LIMIT_PER_MINUTE = 30;
// The quickest raids still take minutes, so this only stops a runaway client.
const RAIDS_PER_HOUR = 30;

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const limited = await rateLimit(supabase, req, "record-raid", IP_RATE_LIMIT_PER_MINUTE, 60);
  if (limited) return limited;

  let body: { install_token?: unknown; account_hash?: unknown; raid?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const { install_token, account_hash } = body ?? {};
  if (!isInstallToken(install_token) || !isAccountHash(account_hash)) {
    return json({ error: "Missing required fields" }, 400);
  }
  const record = parseRaidRecord(body.raid);
  if (typeof record === "string") return json({ error: record }, 400);

  const { data: player, error: playerError } = await supabase
    .from("players")
    .select("account_hash, install_token")
    .eq("account_hash", account_hash)
    .maybeSingle();
  if (playerError) return serverError("record-raid: player lookup failed", playerError);
  if (!player || !tokensMatch(player.install_token, install_token)) {
    return json({ error: "Invalid install_token" }, 401);
  }

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error: countError } = await supabase
    .from("raid_completions")
    .select("id", { count: "exact", head: true })
    .eq("account_hash", account_hash)
    .gte("submitted_at", oneHourAgo);
  if (countError) return serverError("record-raid: rate count failed", countError);
  if ((count ?? 0) >= RAIDS_PER_HOUR) {
    return json({ error: "Rate limit exceeded, try again later" }, 429);
  }

  const { raid, created, error } = await storeRaid(supabase, account_hash, record);
  if (!raid) return serverError("record-raid: store failed", error);
  if (error) console.error("record-raid: page update failed", error);

  return json({ raid: { id: raid.id, total_kc: raid.total_kc }, created }, created ? 201 : 200);
});
