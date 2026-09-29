// POST /update-settings
//
// The plugin's visibility settings, sent whenever they change in its
// config (and once per account until the server has them).
//
// Body: { install_token, account_hash, profile_public: boolean, leaderboard_opt_in: boolean }
// Response: { profile_public, leaderboard_opt_in }
//
// profile_public = false hides the player from /get-player-luck?ign= and
// the leaderboard. leaderboard_opt_in only lists them while
// profile_public is also true (see migration 0006).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getSecretKey } from "../_shared/secret-key.ts";
import {
  isAccountHash,
  isInstallToken,
  json,
  rateLimit,
  serverError,
  tokensMatch,
} from "../_shared/http.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = getSecretKey();

// Per caller IP. Players change these rarely; this only stops scripted spam.
const RATE_LIMIT_PER_HOUR = 60;

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const limited = await rateLimit(supabase, req, "update-settings", RATE_LIMIT_PER_HOUR, 3600);
  if (limited) return limited;

  let body: {
    install_token?: unknown;
    account_hash?: unknown;
    profile_public?: unknown;
    leaderboard_opt_in?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const { install_token, account_hash, profile_public, leaderboard_opt_in } = body ?? {};
  if (!isInstallToken(install_token) || !isAccountHash(account_hash)) {
    return json({ error: "Valid install_token and account_hash are required" }, 400);
  }
  if (typeof profile_public !== "boolean" || typeof leaderboard_opt_in !== "boolean") {
    return json({ error: "profile_public and leaderboard_opt_in must be booleans" }, 400);
  }

  const { data: player, error: fetchError } = await supabase
    .from("players")
    .select("account_hash, install_token")
    .eq("account_hash", account_hash)
    .maybeSingle();
  if (fetchError) return serverError("update-settings: player lookup failed", fetchError);
  if (!player || !tokensMatch(player.install_token, install_token)) {
    return json({ error: "Invalid install_token" }, 401);
  }

  const { error: updateError } = await supabase
    .from("players")
    .update({ profile_public, leaderboard_opt_in })
    .eq("account_hash", account_hash);
  if (updateError) return serverError("update-settings: update failed", updateError);

  return json({ profile_public, leaderboard_opt_in }, 200);
});
