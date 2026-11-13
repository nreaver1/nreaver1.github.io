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
//   Raid completion counts ("Theatre of Blood: Hard Mode") are per mode
//   while the raid page counts every mode, so they raise the page to the
//   sum of what each mode is known to be at (raidKcLowerBound).
//   Counts for the modes of a multi-mode page (Gauntlet, Corrupted
//   Gauntlet) also raise that mode's boss_kc row, which ingest-drop reads
//   to rate a drop over every mode's kills.

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
import { pageSourceForKc, raidKcLowerBound, raiseKc } from "../_shared/page-updates.ts";
import { type ModeCounts, raidModeForKcName } from "../_shared/raids.ts";
import { matchSource } from "../_shared/kc-aliases.ts";
import { PAGE_MODES } from "../_shared/modes.ts";

// Every source of a page that counts several modes, the page's own included.
const MODE_SOURCES = Object.entries(PAGE_MODES).flatMap(([page, m]) => [page, ...m.variants]);

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
  // Raid completion counts are per mode, collected per raid page first.
  const highest = new Map<string, number>();
  const raidCounts = new Map<string, ModeCounts>();
  for (const c of counts as Count[]) {
    const raidMode = raidModeForKcName(c.source_name);
    if (raidMode) {
      if (!sources.includes(raidMode.raid)) continue;
      const modes = raidCounts.get(raidMode.raid) ?? {};
      modes[raidMode.mode] = Math.max(modes[raidMode.mode] ?? 0, c.kc);
      raidCounts.set(raidMode.raid, modes);
      continue;
    }
    const source = pageSourceForKc(c.source_name, sources);
    if (source) highest.set(source, Math.max(highest.get(source) ?? 0, c.kc));
  }

  for (const [raid, modes] of raidCounts) {
    const { data: latest, error: raidError } = await supabase
      .from("raid_completions")
      .select("mode_counts")
      .eq("account_hash", account_hash)
      .eq("raid", raid)
      .order("total_kc", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (raidError) return serverError("update-kc: raid lookup failed", raidError);
    const kc = raidKcLowerBound(raid, modes, (latest?.mode_counts as ModeCounts | undefined) ?? null);
    if (kc > 0) highest.set(raid, kc);
  }

  for (const [source, kc] of highest) {
    const error = await raiseKc(supabase, account_hash, source, kc);
    if (error) return serverError("update-kc: raise failed", error);
  }

  // Modes of a multi-mode page (The Gauntlet, Corrupted Gauntlet): keep
  // each mode's count in boss_kc, so ingest-drop can rate a drop in one
  // mode over the kills from the others too.
  const modeKcs = new Map<string, number>();
  for (const c of counts as Count[]) {
    const source = matchSource(c.source_name, MODE_SOURCES);
    if (source) modeKcs.set(source, Math.max(modeKcs.get(source) ?? 0, c.kc));
  }
  if (modeKcs.size > 0) {
    const { data: stored, error: storedError } = await supabase
      .from("boss_kc")
      .select("boss_name, current_kc")
      .eq("account_hash", account_hash)
      .in("boss_name", [...modeKcs.keys()]);
    if (storedError) return serverError("update-kc: boss kc lookup failed", storedError);
    const now = new Date().toISOString();
    const raised = [...modeKcs]
      .filter(([source, kc]) => kc > ((stored ?? []).find((r) => r.boss_name === source)?.current_kc ?? 0))
      .map(([boss_name, current_kc]) => ({ account_hash, boss_name, current_kc, updated_at: now }));
    if (raised.length > 0) {
      const { error } = await supabase.from("boss_kc").upsert(raised, { onConflict: "account_hash,boss_name" });
      if (error) return serverError("update-kc: boss kc raise failed", error);
    }
  }

  return json({ matched: highest.size }, 200);
});
