// POST /update-kc
//
// Kill counts the plugin saw in chat since its last send, so an
// account's still-hunting rows and log page reads keep up without the
// player reopening their collection log. Sent in batches, only for
// accounts that have synced their log at least once.
//
// Body: { install_token, account_hash, counts: [{ source_name, kc }, ...] }
//   source_name is the boss as the kill-count message prints it
//   ("Barrows chest", "Zulrah"); see _shared/page-updates.ts for which
//   pages a name can raise. A count only ever raises a stored kill count.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getSecretKey } from "../_shared/secret-key.ts";
import {
  isAccountHash,
  isInstallToken,
  isKc,
  isSourceName,
  json,
  rateLimit,
  serverError,
  tokensMatch,
} from "../_shared/http.ts";
import { pageSourceForKc, raiseKc } from "../_shared/page-updates.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = getSecretKey();

const MAX_COUNTS = 100;
// Per caller IP, covering requests that fail auth or validation too.
const IP_RATE_LIMIT_PER_MINUTE = 20;

interface Count {
  source_name: string;
  kc: number;
}

const isCount = (d: unknown): d is Count => {
  const r = d as Record<string, unknown> | null;
  return !!r && isSourceName(r.source_name) && isKc(r.kc) && (r.kc as number) > 0;
};

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const limited = await rateLimit(supabase, req, "update-kc", IP_RATE_LIMIT_PER_MINUTE, 60);
  if (limited) return limited;

  let body: { install_token?: unknown; account_hash?: unknown; counts?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const { install_token, account_hash, counts } = body ?? {};
  if (!isInstallToken(install_token) || !isAccountHash(account_hash)) {
    return json({ error: "Missing required fields" }, 400);
  }
  if (!Array.isArray(counts) || counts.length === 0 || counts.length > MAX_COUNTS || !counts.every(isCount)) {
    return json({ error: `counts must be 1 to ${MAX_COUNTS} of {source_name, kc > 0}` }, 400);
  }

  const { data: player, error: playerError } = await supabase
    .from("players")
    .select("account_hash, install_token")
    .eq("account_hash", account_hash)
    .maybeSingle();
  if (playerError) return serverError("update-kc: player lookup failed", playerError);
  if (!player || !tokensMatch(player.install_token, install_token)) {
    return json({ error: "Invalid install_token" }, 401);
  }

  // Only sources this account has a page read or hunting rows for can be raised.
  const [{ data: pages, error: pagesError }, { data: hunting, error: huntingError }] = await Promise.all([
    supabase.from("log_pages").select("source_name").eq("account_hash", account_hash),
    supabase.from("hunting_items").select("source_name").eq("account_hash", account_hash),
  ]);
  if (pagesError) return serverError("update-kc: page lookup failed", pagesError);
  if (huntingError) return serverError("update-kc: hunting lookup failed", huntingError);
  const sources = [...new Set([...(pages ?? []), ...(hunting ?? [])].map((r) => r.source_name as string))];

  // Highest count per page, in case two names or two batches map to one.
  const highest = new Map<string, number>();
  for (const c of counts as Count[]) {
    const source = pageSourceForKc(c.source_name, sources);
    if (source) highest.set(source, Math.max(highest.get(source) ?? 0, c.kc));
  }

  for (const [source, kc] of highest) {
    const error = await raiseKc(supabase, account_hash, source, kc);
    if (error) return serverError("update-kc: raise failed", error);
  }

  return json({ matched: highest.size }, 200);
});
