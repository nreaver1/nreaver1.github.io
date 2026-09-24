// GET /drop-rates-catalog
//
// Public, read-only list of every (item_id, source_name) pair we have a
// drop rate for. Used by the plugin to populate its manual backfill
// dropdown — the plugin can't submit a backfill for an item/source pair
// this endpoint doesn't return, since backfill-drop checks the same
// drop_rates table via foreign key.
//
// This is just a thin wrapper over drop_rates, which is already
// publicly readable per its RLS policy (drop_rates_public_read). A
// dedicated endpoint exists mainly for consistent apiBaseUrl usage
// across all plugin<->backend calls, rather than the plugin needing a
// second base URL for direct PostgREST access.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getSecretKey } from "../_shared/secret-key.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = getSecretKey();

Deno.serve(async (req) => {
  if (req.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const { data, error } = await supabase
    .from("drop_rates")
    .select("item_id, source_name")
    .order("source_name");

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
    });
  }

  return new Response(JSON.stringify({ entries: data }), { status: 200 });
});
