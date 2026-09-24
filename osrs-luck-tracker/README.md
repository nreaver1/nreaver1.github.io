# OSRS Luck Tracker — Frontend

Next.js (App Router) + Tailwind. Implements the two Phase 3 pages from
the original spec: home (search) and player profile (luck stats).
Leaderboard pages are intentionally not built yet, matching the backend
gating decision — nothing to wire up until that endpoint is enabled.

## Design

See the design plan in the parent conversation for full rationale.
Short version: a ledger/odds-book aesthetic (warm ink background, brass
accent, moss/rust for lucky/dry), Newsreader serif for headlines and
prose, IBM Plex Mono with tabular figures for every number — KC counts
and percentages need to align down a column, so the numeric face isn't
decorative here.

## Structure

```
app/
  layout.tsx              -- fonts, global chrome
  globals.css              -- Tailwind + focus states + reduced-motion
  page.tsx                 -- home: hero + search
  player/[ign]/
    page.tsx                -- profile: summary cards + table
    not-found.tsx            -- shown when getPlayerLuck() returns null
components/
  Nav.tsx, SearchBar.tsx, SummaryCard.tsx, LuckTable.tsx, LuckBar.tsx, LuckBadge.tsx
lib/
  api.ts                    -- fetch wrapper around /get-player-luck
  types.ts                  -- mirrors the backend's LuckResult shape
  mock-data.ts              -- standalone demo data (see below)
  item-names.json           -- id -> display name, same vetted dataset as the backend resolver
```

## Running it

```bash
npm install
npm run dev
```

By default `NEXT_PUBLIC_API_BASE` is unset, so the app serves
deterministic mock data (`/player/Zezima` works out of the box) — useful
for reviewing the UI without a live Supabase project. To connect the
real backend:

```bash
# .env.local
NEXT_PUBLIC_API_BASE=https://<your-project-ref>.supabase.co/functions/v1
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Get the publishable key from **Settings > API Keys > Publishable and
secret API keys** in the Supabase dashboard (create it there if the
project doesn't have one yet). This is the *publishable* key — safe to
ship in the client bundle — never put the secret key here. It's sent on
the `apikey` header on every request; Supabase's gateway requires a
valid apikey to route any request to your project, independent of the
`verify_jwt` setting on the function itself.

## What was verified before shipping this

- `npm run build` — full production build, including TypeScript
  type-checking, completes clean (verified with system fonts locally,
  since this sandbox can't reach fonts.googleapis.com; Newsreader/IBM
  Plex Mono will fetch normally on Vercel or any environment with open
  internet).
- Runtime smoke test against `next dev`: home page renders,
  `/player/Zezima` renders the full mock-data pipeline (search →
  lookup → item-name resolution → summary cards → table), and an
  unknown IGN correctly renders the not-found page with a 404 status.

## Known gaps / next steps
- **No loading skeleton on the profile route, on purpose.** I built one
  (`loading.tsx`) and then removed it after testing surfaced a real
  Next.js limitation: adding a `loading.tsx` makes the route stream,
  and Next.js cannot set a proper 404 status code on a streamed
  response — `notFound()` still renders the right not-found page
  content, but the HTTP status silently stays 200 instead of 404.
  Verified this directly (`next start` + `curl -w "%{http_code}"`)
  before and after removing the file. Correct status codes matter more
  than a skeleton right now, especially with mock data resolving
  instantly — but once this is wired to a real, possibly-slow backend,
  it's worth re-adding a narrower Suspense boundary around just the
  data-dependent part of the page (not the whole route) to get both.
- **Item names on the backend.** `/get-player-luck` only returns
  `item_id`, not a name — the frontend resolves names client-side from
  a bundled copy of the same vetted item dataset used by the backend's
  resolver. This works, but means item names live in two places. If a
  new item's `item_id` doesn't appear in the bundled dataset, it falls
  back to `Item #12345` rather than breaking. Consider having the
  backend join item names server-side in a later pass so there's one
  source of truth.
- **`driest_in_progress`-style "still grinding" indicators** aren't on
  the profile page yet — the current UI only shows drops that have
  already happened, per the v1 solo-stats-first priority. Worth adding
  once it's useful context.
- Leaderboard UI: not started, on purpose (backend endpoint is gated
  off — see Phase 1 README).

## Demo data for testing
Three profiles are seeded for exercising every part of the UI without
a backend:
- `/player/Zezima` — full range: spooned, average, dry, desert, and one
  `multi_roll` item to test the "not yet supported" path.
- `/player/Newscape` — a small, all-average dataset (newer account).
- `/player/EmptyLogs` — no drops yet, exercises the empty state.
- Any other name — exercises the not-found page (verified returns a
  real HTTP 404, not just 404-looking content).
