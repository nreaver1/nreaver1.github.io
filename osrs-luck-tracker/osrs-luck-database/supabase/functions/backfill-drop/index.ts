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
//   { install_token, account_hash,
//     drops: [{ item_id, source_name, snapshot_kc?, snapshot_quantity? }, ...] }
//
// Deliberately has NO kc_received field — there is nothing to fill in,
// since this is precisely the "we don't know which kill" case. The
// optional snapshot is the log page's kill count and the item's quantity
// when the plugin read the page (both or neither; see migration 0007).
//
// Items the account already has a row for (a real tracked drop or an
// earlier backfill) are skipped rather than duplicated. Single mode
// reports that as 409, batch mode counts it in `already_recorded`. The
// one exception: a batch drop with a snapshot fills it in on an earlier
// backfill that has none (`snapshots_added`), so logs imported before
// snapshots existed can gain one. It never overwrites a snapshot, and
// skips pairs that tracking has recorded a drop for since, whose copies
// the log's quantity would now count twice.

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

interface Snapshot {
  snapshot_kc: number;
  snapshot_quantity: number;
}

type RequestedDrop = DropKey & Partial<Snapshot>;

// Both fields or neither.
function snapshotOf(d: Record<string, unknown>): Snapshot | null | "invalid" {
  const { snapshot_kc: kc, snapshot_quantity: quantity } = d;
  if (kc === undefined && quantity === undefined) return null;
  if (isKc(kc) && isKc(quantity) && quantity >= 1) {
    return { snapshot_kc: kc, snapshot_quantity: quantity };
  }
  return "invalid";
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
    drops?: Record<string, unknown>[];
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

  let requested: RequestedDrop[];
  if (isBatch) {
    const valid = body.drops!.every(
      (d) =>
        d && isItemId(d.item_id) && isSourceName(d.source_name) && snapshotOf(d) !== "invalid",
    );
    if (!valid || body.drops!.length === 0) {
      return json({
        error: "drops must be a non-empty array of {item_id, source_name, snapshot_kc?, snapshot_quantity?}",
      }, 400);
    }
    if (body.drops!.length > MAX_BATCH_SIZE) {
      return json({ error: `At most ${MAX_BATCH_SIZE} drops per request` }, 400);
    }
    // Dedupe within the request so one bad client list can't trip the
    // unique index mid-insert.
    const seen = new Map<string, RequestedDrop>();
    for (const d of body.drops! as (DropKey & Record<string, unknown>)[]) {
      const snapshot = snapshotOf(d) as Snapshot | null;
      seen.set(pairKey(d), { item_id: d.item_id, source_name: d.source_name, ...snapshot });
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
    .select("id, item_id, source_name, is_backfilled, snapshot_kc")
    .eq("account_hash", account_hash)
    .in("item_id", itemIds);

  if (existingError) return serverError("backfill-drop: existing lookup failed", existingError);
  const existingPairs = new Set((existing ?? []).map(pairKey));
  const trackedPairs = new Set((existing ?? []).filter((r) => !r.is_backfilled).map(pairKey));

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

  // Earlier backfills this batch carries a snapshot for, per the header.
  const snapshotByPair = new Map(
    alreadyRecorded.filter((d) => d.snapshot_kc !== undefined).map((d) => [pairKey(d), d]),
  );
  const snapshotTargets = isBatch
    ? (existing ?? []).filter((r) =>
      r.is_backfilled && r.snapshot_kc === null &&
      snapshotByPair.has(pairKey(r)) && !trackedPairs.has(pairKey(r))
    )
    : [];
  let snapshotsAdded = 0;
  for (const row of snapshotTargets) {
    const d = snapshotByPair.get(pairKey(row))!;
    // The null guard makes a concurrent import a no-op, not an overwrite.
    const { data: updated, error: updateError } = await supabase
      .from("collection_log_drops")
      .update({ snapshot_kc: d.snapshot_kc, snapshot_quantity: d.snapshot_quantity })
      .eq("id", row.id)
      .is("snapshot_kc", null)
      .select("id");
    if (updateError) return serverError("backfill-drop: snapshot update failed", updateError);
    snapshotsAdded += updated?.length ?? 0;
  }

  if (toInsert.length === 0) {
    return json({
      inserted: 0,
      already_recorded: alreadyRecorded.length,
      snapshots_added: snapshotsAdded,
      unknown,
    }, 200);
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
    snapshot_kc: d.snapshot_kc ?? null,
    snapshot_quantity: d.snapshot_quantity ?? null,
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
    {
      inserted: inserted?.length ?? 0,
      already_recorded: alreadyRecorded.length,
      snapshots_added: snapshotsAdded,
      unknown,
    },
    201,
  );
});
