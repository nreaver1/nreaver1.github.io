// supabase/functions/_shared/http.ts
//
// Response, validation and rate-limit helpers shared by every edge
// function. All of these endpoints are publicly callable with the
// publishable key, so treat every body and query param as hostile.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// Logs the real error server-side and returns a generic 500, so database
// error text (table, column and constraint names) never reaches callers.
export function serverError(where: string, err: unknown): Response {
  console.error(`${where}:`, err);
  return json({ error: "Internal error" }, 500);
}

// --- Input validation ---------------------------------------------------

// The plugin sends Long.toHexString(client.getAccountHash()).
const ACCOUNT_HASH_RE = /^[0-9a-f]{1,16}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// OSRS names: 1-12 letters, digits, spaces, hyphens and underscores. The
// client can report spaces as non-breaking spaces ( ).
const IGN_RE = /^[A-Za-z0-9 _\- ]{1,12}$/;

// Generous upper bounds, only there to reject garbage.
const MAX_ITEM_ID = 1_000_000;
const MAX_KC = 10_000_000;
const MAX_SOURCE_NAME_LENGTH = 100;

export const isAccountHash = (v: unknown): v is string =>
  typeof v === "string" && ACCOUNT_HASH_RE.test(v);

export const isInstallToken = (v: unknown): v is string =>
  typeof v === "string" && UUID_RE.test(v);

export const isIgn = (v: unknown): v is string =>
  typeof v === "string" && IGN_RE.test(v);

export const isItemId = (v: unknown): v is number =>
  Number.isInteger(v) && (v as number) > 0 && (v as number) <= MAX_ITEM_ID;

export const isKc = (v: unknown): v is number =>
  Number.isInteger(v) && (v as number) >= 0 && (v as number) <= MAX_KC;

export const isSourceName = (v: unknown): v is string =>
  typeof v === "string" && v.length > 0 && v.length <= MAX_SOURCE_NAME_LENGTH;

// Constant-time string comparison for install tokens.
export function tokensMatch(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  }
  return diff === 0;
}

// --- Rate limiting ------------------------------------------------------

// Supabase's gateway puts the caller's address first in x-forwarded-for.
function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

// Counts one request from this caller against `name`'s limit (see the
// hit_rate_limit SQL function, migration 0004). Returns a 429 response
// when over the limit, otherwise null. Fails open if the counter itself
// errors, so a database hiccup doesn't take every endpoint down; the
// per-account limits in ingest-drop / backfill-drop still apply then.
export async function rateLimit(
  supabase: SupabaseClient,
  req: Request,
  name: string,
  limit: number,
  windowSeconds: number,
): Promise<Response | null> {
  const bucket = `${name}:${await sha256(clientIp(req))}`;
  const { data, error } = await supabase.rpc("hit_rate_limit", {
    p_bucket: bucket,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error) {
    console.error(`${name}: rate limit check failed`, error);
    return null;
  }
  return data === false ? json({ error: "Rate limit exceeded, try again later" }, 429) : null;
}
