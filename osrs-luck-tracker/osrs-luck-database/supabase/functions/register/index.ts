// POST /register
//
// Called automatically by the RuneLite plugin on first run. No manual
// claim flow — the plugin sends its locally-derived account_hash and IGN,
// and the server mints (or returns the existing) install_token.
//
// Body: { account_hash: string, ign: string }
// Response: { install_token: string }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getSecretKey } from "../_shared/secret-key.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = getSecretKey();

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  let body: { account_hash?: string; ign?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
    });
  }

  const { account_hash, ign } = body;
  if (!account_hash || !ign) {
    return new Response(
      JSON.stringify({ error: "account_hash and ign are required" }),
      { status: 400 },
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // Upsert: first run creates the player row and mints a token (default
  // gen_random_uuid() on insert). Subsequent runs just return the
  // existing token and refresh the IGN / ign_history if it changed.
  const { data: existing, error: fetchError } = await supabase
    .from("players")
    .select("account_hash, ign, ign_history, install_token")
    .eq("account_hash", account_hash)
    .maybeSingle();

  if (fetchError) {
    return new Response(JSON.stringify({ error: fetchError.message }), {
      status: 500,
    });
  }

  if (!existing) {
    const { data: inserted, error: insertError } = await supabase
      .from("players")
      .insert({ account_hash, ign })
      .select("install_token")
      .single();

    if (insertError) {
      return new Response(JSON.stringify({ error: insertError.message }), {
        status: 500,
      });
    }
    return new Response(
      JSON.stringify({ install_token: inserted.install_token }),
      { status: 201 },
    );
  }

  if (existing.ign !== ign) {
    const history = Array.isArray(existing.ign_history)
      ? existing.ign_history
      : [];
    history.push({ ign: existing.ign, changed_at: new Date().toISOString() });
    await supabase
      .from("players")
      .update({ ign, ign_history: history, last_updated: new Date().toISOString() })
      .eq("account_hash", account_hash);
  }

  return new Response(
    JSON.stringify({ install_token: existing.install_token }),
    { status: 200 },
  );
});
