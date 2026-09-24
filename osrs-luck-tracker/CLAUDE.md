# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

OSRS Collection Log Luck Tracker: shows how "spooned" or "dry" a player was for each collection log drop. This directory lives inside the `nreaver1.github.io` portfolio repo. It holds three separately built projects that talk to each other over HTTP:

| Path | What | Stack |
|---|---|---|
| `./` (root: `app/`, `components/`, `lib/`) | Website: home search + player profile | Next.js 16 App Router, React 18, Tailwind 3, TypeScript |
| `osrs-luck-database/` | Schema, luck calculation engine, edge functions | Supabase (Postgres + Deno edge functions) |
| `osrs-luck-plugin/` | RuneLite plugin that reports new drops | Java 11, Gradle, Lombok |

Data flow: the plugin calls `/register` (mints an `install_token`), then `/ingest-drop` or `/backfill-drop`. The site calls `/get-player-luck?ign=X`. Each sub-project has its own README with detailed status and rationale, so read that before making larger changes.

## Commands

Frontend (run from this directory):
```bash
npm install
npm run dev      # mock data unless NEXT_PUBLIC_API_BASE is set
npm run build    # production build + TypeScript type-check (there's no separate typecheck script)
npm run lint
```
The frontend has no test suite.

Backend (from `osrs-luck-database/`, needs the Supabase CLI and Deno):
```bash
supabase db push                                  # applies migrations/0001, then 0002
supabase functions deploy register ingest-drop backfill-drop drop-rates-catalog get-player-luck leaderboard
deno run --allow-net --allow-env scripts/sync-drop-rates.ts   # needs SUPABASE_URL + SUPABASE_SECRET_KEY exported manually
```
The backend has no automated tests. The README suggests adding `Deno.test` against `_shared/calculations.ts`.

Plugin (from `osrs-luck-plugin/`):
```bash
./gradlew build
./gradlew test --tests com.osrslucktracker.LuckTrackerPluginTest
```
`BackfillPlannerTest` is the real unit test. `LuckTrackerPluginTest` is the standard RuneLite launcher used to run the plugin in a dev client, not a unit test. `./gradlew build` currently fails at checkstyle, because `build.gradle` applies it but there's no `config/checkstyle/checkstyle.xml`. With only Java 26 installed, set `JAVA_HOME` to `~/.jdks/temurin-26.0.2.1`.

To type-check an edge function, run `npx deno check --no-config supabase/functions/<name>/index.ts`. Without `--no-config`, Deno picks up the frontend's `package.json` and reports `Deno` as undefined.

## Architecture notes

- **Mock mode.** `lib/api.ts` returns deterministic data from `lib/mock-data.ts` when `NEXT_PUBLIC_API_BASE` is empty. Seeded IGNs: `Zezima` (every state, including `multi_roll`/unsupported), `Newscape` (small, all average), `EmptyLogs` (empty state). Any other IGN is not found and returns a real HTTP 404.
- **Types are duplicated across projects.** `lib/types.ts` mirrors `osrs-luck-database/supabase/functions/_shared/types.ts` (`LuckResult`). The plugin's `*Request`/`*Response` Java classes mirror the edge function bodies. When you change an API shape, update every copy.
- **Item names are resolved on the client.** The API returns only `item_id`. `lib/item-names.json` maps id to name and falls back to `Item #<id>`. The backend resolves names separately with `_shared/item-resolver.ts` and `data/osrs_items.json`. The plugin uses RuneLite's `itemManager.search()` at runtime.
- **A luck result can be in one of three states, and they must stay distinct:**
  - Computed probability `P`, labeled by `labelFor` in `_shared/calculations.ts`: `>0.99` desert, `>0.8` dry, `<0.1` spooned, otherwise average. `estimated=true` marks the `points_based`/`streak_adjusted` approximations.
  - `supported=false` (`multi_roll`/`unsupported` distributions): don't display `P`.
  - `backfilled=true` (item logged before tracking started): `kc_received` is null and `probability` is NaN. Never render it as a number or make up a KC. `calculateLuck()` checks this flag before any distribution math.
- **Supabase auth model.** All functions set `verify_jwt = false` (`supabase/config.toml`) because the new `sb_publishable_`/`sb_secret_` keys aren't JWTs. Each function does its own authorization: `ingest-drop` and `backfill-drop` check `install_token`, and the rest are public. Every caller still sends an `apikey` header. The frontend and plugin use only the publishable key. `_shared/secret-key.ts` reads `SUPABASE_SECRET_KEYS` and falls back to the legacy `SUPABASE_SERVICE_ROLE_KEY`.
- **Leaderboard is gated on purpose.** `/leaderboard` returns 501 unless `LEADERBOARD_ENABLED=true`. No leaderboard UI exists yet, and that's also intentional.
- **Don't add `loading.tsx` to `app/player/[ign]/`.** It makes the route stream, and then `notFound()` returns status 200 instead of 404. If you need a loading state, use a narrow Suspense boundary around the data-dependent part only.
- **Plugin drop attribution** (`LuckTrackerPlugin.onChatMessage`): a "New item added to your collection log" message counts only if it arrives within 5s of a "Your X kill count is: N." message. Non-boss sources (clues, pets, minigames) are skipped on purpose.
- **Collection log import** (`onScriptPostFired`, `CollectionLogIndex`, `BackfillPlanner`): reads each log page after the game's `COLLECTION_DRAW_LIST` script draws it (opacity 0 = obtained). Only items that appear on exactly one log page are imported, because the log fills shared items (e.g. godsword shards) on every page that lists them. The page→item layout comes from cache structs 471–475. Everything fails closed, and imports go to `/backfill-drop` in batch mode. The plugin README has the full rationale.
- **Design language.** Casino theme on a dark ink background with a brass accent. The flame gradient is reserved for "spooned"/jackpot moments; dry results use a crimson tone. Headlines use Fraunces (`font-serif`). Data and labels use Oswald through the `font-mono` token, which keeps that name so the typeface can change without touching components. Tokens are in `tailwind.config.ts` and fonts in `app/layout.tsx`. The README's design section describes an older look.
- **Page layout.** `<main>` is a CSS grid (`.page-grid` in `app/globals.css`), not a `max-w` box. Children land in a reading-width `content` column aligned with the header; `.breakout-wide` children span a wider column (used by the comparison cards and table). A page that needs breakouts makes its root `.page-grid-nested`. On phones both columns are the same width.
- **Player comparison.** `/player/A?vs=B&vs=C` compares players; the URL is the only state. `lib/compare.ts` cleans the list (dedupes case-insensitively, drops the primary player, caps it at `MAX_COMPARED`) and pivots results into one row per (item, source). Each row marks its luckiest player (lowest probability). This only happens when at least two players have a rated result: backfilled and unsupported results never count, and ties mark everyone tied. Only the primary player can trigger a 404 or the error page. A compared player who is missing or fails to load gets a removable notice instead. The header search (`NavSearch`) is hidden on `/`, since the home page has its own.

## Gotchas

- `frontend-patch/` holds copies of `components/LuckTable.tsx`, `components/SummaryCard.tsx`, `lib/mock-data.ts` and `lib/types.ts`. Right now they match the live files. Edit the live files, not the copies.
- `tsconfig.json` excludes `osrs-luck-database` and `frontend-patch`. Keep those exclusions: the Deno code (`https://esm.sh/...` imports, `Deno.env`) and the patch copies (broken relative imports) both fail the Next.js type-check.
- The plugin has never been compiled against a real `runelite-client` in the sandbox where it was written. Check any RuneLite API usage with a Gradle sync.
