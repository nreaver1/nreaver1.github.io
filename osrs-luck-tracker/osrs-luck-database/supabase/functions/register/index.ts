// POST /register
//
// Called automatically by the RuneLite plugin on first run. No manual
// claim flow — the plugin sends its locally-derived account_hash and IGN,
// and the server mints an install_token.
//
// A token is only ever handed out when the player row is created. For an
// existing account the caller must already hold its token (sent to
// refresh the IGN); otherwise 409. Returning the existing token to anyone
// who knew the account_hash would let them submit drops as that player.
//
// Body: { account_hash: string, ign: string, install_token?: string }
// Response: { install_token: string }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
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

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = getSecretKey();

// Per caller IP. One household with a few alts registers a handful of
// accounts once each; this only stops scripted row spam.
const RATE_LIMIT_PER_HOUR = 20;

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const limited = await rateLimit(supabase, req, "register", RATE_LIMIT_PER_HOUR, 3600);
  if (limited) return limited;

  let body: { account_hash?: unknown; ign?: unknown; install_token?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const { account_hash, install_token } = body ?? {};
  const ign = parseIgn(body?.ign);
  if (!isAccountHash(account_hash) || !ign) {
    return json({ error: "Valid account_hash and ign are required" }, 400);
  }
  if (install_token != null && !isInstallToken(install_token)) {
    return json({ error: "Invalid install_token" }, 400);
  }

  // First run creates the player row and mints a token (default
  // gen_random_uuid() on insert). Later calls must prove ownership with
  // the existing token before the IGN / ign_history is refreshed.
  const { data: existing, error: fetchError } = await supabase
    .from("players")
    .select("account_hash, ign, ign_history, install_token")
    .eq("account_hash", account_hash)
    .maybeSingle();

  if (fetchError) return serverError("register: player lookup failed", fetchError);

  if (!existing) {
    const { data: inserted, error: insertError } = await supabase
      .from("players")
      .insert({ account_hash, ign })
      .select("install_token")
      .single();

    if (insertError) {
      // 23505: a concurrent request registered this account first.
      if (insertError.code === "23505") return alreadyRegistered();
      return serverError("register: insert failed", insertError);
    }
    return json({ install_token: inserted.install_token }, 201);
  }

  if (!install_token || !tokensMatch(existing.install_token, install_token)) {
    return alreadyRegistered();
  }

  if (existing.ign !== ign) {
    const history = Array.isArray(existing.ign_history)
      ? existing.ign_history
      : [];
    history.push({ ign: existing.ign, changed_at: new Date().toISOString() });
    const { error: updateError } = await supabase
      .from("players")
      .update({ ign, ign_history: history, last_updated: new Date().toISOString() })
      .eq("account_hash", account_hash);
    if (updateError) return serverError("register: ign update failed", updateError);
  }

  return json({ install_token: existing.install_token }, 200);
});

function alreadyRegistered(): Response {
  return json({ error: "Account already registered" }, 409);
}
