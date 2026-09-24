# OSRS Collection Log Luck Tracker — Backend

Database schema + luck calculation engine. See
`phase1_db_and_calc_engine_spec.md` (in the parent conversation) for the
full design rationale; this README covers what's actually built and how
to run it. The frontend and RuneLite plugin live in sibling projects —
see their own READMEs.

## What's here

```
supabase/
  config.toml                            -- verify_jwt=false for all 6 functions (new key model requires this)
  migrations/
    0001_initial_schema.sql               -- tables, enum, RLS, leaderboard views (gated)
    0002_backfill_support.sql             -- nullable kc_received + is_backfilled flag, for manual backfill
  functions/
    _shared/types.ts                      -- shared TS types
    _shared/calculations.ts               -- the luck calculation engine (pure functions)
    _shared/secret-key.ts                 -- reads SUPABASE_SECRET_KEYS (new) with legacy fallback
    register/index.ts                     -- POST /register  (mints install_token, automatic)
    ingest-drop/index.ts                  -- POST /ingest-drop (anti-cheat + insert)
    backfill-drop/index.ts                -- POST /backfill-drop (single item or batch; no KC, no anti-cheat)
    drop-rates-catalog/index.ts           -- GET /drop-rates-catalog (public, feeds the plugin's backfill dropdown)
    get-player-luck/index.ts              -- GET /get-player-luck?ign=X  (v1 priority endpoint)
    leaderboard/index.ts                  -- GET /leaderboard (built, returns 501 until enabled)
scripts/
  sync-drop-rates.ts                      -- wiki sync for flat_geometric rates
data/
  osrs_items.json                         -- offline item name->id dataset (16,141 items, MIT licensed source)
  manual_metadata_stub.json               -- hand-transcription template for points_based/streak_adjusted
```

## Build status

| Piece | Status |
|---|---|
| Schema (all 5 tables, RLS, enum) | Done |
| `flat_geometric` calculation | Done, verified against known CDF benchmark (see below) |
| `points_based` / `streak_adjusted` calculation | Approximation implemented, needs real metadata filled in via `data/manual_metadata_stub.json` |
| `/register` | Done — automatic token minting on first plugin run |
| `/ingest-drop` | Done — rate limiting, kc sanity check, submission-lag check |
| `/backfill-drop` | Done — records "obtained, KC unknown" entries, explicitly flagged (`is_backfilled`), never computes a fake probability. Accepts one item or a `drops: [...]` batch (up to 500) for the plugin's collection log import. Skips pairs the account already has a row for. Constraint behavior (duplicate rejection, coexistence with a later real drop of the same item) verified against real Postgres; batch mode has not been run against a live project yet. |
| `/drop-rates-catalog` | Done — public list of valid item/source pairs, feeds the plugin's backfill dropdown |
| `/get-player-luck` | Done — the v1-priority solo stats endpoint |
| `/leaderboard` | Built, **returns 501 until `LEADERBOARD_ENABLED=true`** is set, per scope decision |
| Wiki sync script | Done. Wikitext fetch + template parsing + item name→id resolution all implemented and verified end-to-end against real GWD drop data. |
| Item name→id resolution | Done — `_shared/item-resolver.ts`, backed by an offline dataset (`data/osrs_items.json`, 16,141 items, trimmed from the MIT-licensed `osrs-item-data` npm package). Exact-name and base-name matching; ambiguous or unmatched names are skipped and logged rather than guessed at (verified against real collisions, e.g. "Tumeken's shadow" correctly flags ambiguous since it has charged/uncharged variants). |
| Frontend (Next.js) | Done — see `osrs-luck-frontend/README.md` |
| RuneLite plugin (Java) | First draft, connected and running against a real deployment — see `osrs-luck-plugin/README.md` for what's verified vs. not |

## Setup

1. Create a Supabase project.
2. Under **Settings > API Keys**, select the **Publishable and secret API keys** tab and create the `default` publishable and secret keys (older projects need to click "Create new API keys" first). Legacy `anon`/`service_role` keys keep working alongside these — see [Supabase's migration guide](https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys) for background.
3. `supabase db push` (or run `0001_initial_schema.sql` then `0002_backfill_support.sql`, in that order, directly) against your project.
4. Merge `supabase/config.toml` into your project's config (created by `supabase init`). This sets `verify_jwt = false` on all six functions — required because the new secret/publishable keys aren't JWTs, so the platform's default JWT check would otherwise reject every caller. Each function handles its own authorization in code instead (`ingest-drop`/`backfill-drop` check `install_token`; the others are intentionally public reads).
5. Deploy all six edge functions: `supabase functions deploy register ingest-drop backfill-drop drop-rates-catalog get-player-luck leaderboard`.
6. Set `LEADERBOARD_ENABLED=false` via `supabase secrets set LEADERBOARD_ENABLED=false` (leave off until solo stats ship). You do **not** need to set `SUPABASE_URL` or a secret key manually — Supabase auto-injects `SUPABASE_URL` and `SUPABASE_SECRET_KEYS` (new) / `SUPABASE_SERVICE_ROLE_KEY` (legacy) into every function's environment. `_shared/secret-key.ts` reads the new one first and falls back to the legacy var automatically.
7. Before running `scripts/sync-drop-rates.ts`, export its config manually — **this script runs standalone, outside the Edge Functions runtime, so it does not get the auto-injected vars**:
   ```bash
   export SUPABASE_URL=https://<your-ref>.supabase.co
   export SUPABASE_SECRET_KEY=sb_secret_...   # raw string from Settings > API Keys, NOT the JSON blob edge functions get
   deno run --allow-net --allow-env scripts/sync-drop-rates.ts
   ```
8. Manually fill in `data/manual_metadata_stub.json`-style entries for at least one `points_based` raid unique to exercise that code path end to end.

## Historical backfill — design note

There is no way to recover which kill produced an item someone already
had before installing the plugin — that data doesn't exist anywhere.
Rather than fake a KC (which would inject statistically misleading luck
percentages into the exact tool meant to get those numbers right),
backfilled entries are recorded with `kc_received = null` and
`is_backfilled = true`, and `calculateLuck()` short-circuits on that flag
before any distribution-type math runs — see `_shared/calculations.ts`.
The frontend renders these as a distinct third state ("logged before
tracking — luck unknown"), never as a computed percentage. Backfilling
is always an explicit player action in the plugin's side panel: either
one item from a dropdown, or confirming an import list built from the
collection log pages the player opened in-game. See the plugin README's
"Collection log import" section for how that list is built and why
shared items are left out.

## Verifying the calculation engine

The geometric CDF was sanity-checked against a known statistical
identity: at `kc_received == denominator`, `P` should converge to
`1 - 1/e ≈ 63.21%`. Ran against `geometricCDF(512, 1, 512)` → `0.6325`,
within expected floating-point tolerance.

No automated test suite is wired up yet — recommend adding Deno's
built-in test runner (`Deno.test`) against `_shared/calculations.ts`
before Phase 2, particularly for the `streakAdjustedApprox` piecewise
logic, which is the most likely place for an off-by-one on segment
boundaries.

## Data attribution
`data/osrs_items.json` is trimmed from the `osrs-item-data` npm package
(MIT license, © bingoscape), which itself scrapes OSRS Wiki item
infobox data. Re-pull and re-trim periodically if new items ship and
aren't resolving.

## What's intentionally NOT built yet
- Leaderboard exposure — schema/queries exist, endpoint gated off.
- Automated wiki sync scheduling (cron/edge function trigger) — script
  exists, not yet hooked to a schedule.
- Non-boss collection log sources (clues, skilling pets, minigames) in
  the plugin's live-tracking path — see the plugin README's known
  limitations.
