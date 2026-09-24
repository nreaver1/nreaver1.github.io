# Phase 1 Scope: Database & Luck Calculation Engine
## OSRS Collection Log Luck Tracker

This scopes Phase 1 only (DB schema, drop-rate reference data, and the calculation engine) with the corrections from the spec review applied. Frontend, plugin, and edge function *wiring* are out of scope here — this is schema + logic.

---

## 1. Revised Database Schema

### `players`
| Column | Type | Notes |
|---|---|---|
| `account_hash` | UUID/String, PK | Anonymized identifier from RuneLite |
| `ign` | String, indexed | Current display name |
| `ign_history` | JSONB | Array of `{ign, changed_at}` — RSNs change, don't lose historical searchability |
| `install_token` | String, unique, indexed | Per-installation auth token (see §4) |
| `leaderboard_opt_in` | Boolean, default `false` | Privacy control — off by default |
| `created_at` | Timestamp | |
| `last_updated` | Timestamp | |

### `boss_kc`
| Column | Type | Notes |
|---|---|---|
| `id` | UUID, PK | |
| `account_hash` | FK → players | |
| `boss_name` | String | |
| `current_kc` | Integer | |
| `updated_at` | Timestamp | |
| Constraint | Unique `(account_hash, boss_name)` | unchanged |

### `collection_log_drops`
| Column | Type | Notes |
|---|---|---|
| `id` | UUID, PK | |
| `account_hash` | FK → players | |
| `item_id` | Integer | |
| `source_name` | String | Boss/monster/activity |
| `kc_received` | Integer | **[CRITICAL FLAG]** |
| `kc_at_previous_drop` | Integer, nullable | For streak-adjusted items (see §2.3) — KC since last drop of *this specific item*, not lifetime KC |
| `roll_context` | JSONB, nullable | Points/deaths snapshot for points-based drops (see §2.2) |
| `date_received` | Timestamp | |
| `date_submitted` | Timestamp | Server receipt time — used for anti-cheat timing checks, kept separate from `date_received` |
| Constraint | Unique `(account_hash, item_id, source_name, kc_received)` | **Fixed** — original spec's constraint collided across multi-source items at matching KC |

### `drop_rates`
| Column | Type | Notes |
|---|---|---|
| `item_id` | Integer | |
| `source_name` | String | |
| `distribution_type` | Enum | `flat_geometric` \| `points_based` \| `streak_adjusted` \| `multi_roll` \| `unsupported` — **new** |
| `denominator` | Integer | Base rate denominator (meaning varies by type, see §2) |
| `numerator` | Integer, default 1 | |
| `rolls_per_kill` | Integer, default 1 | For `multi_roll` type |
| `metadata` | JSONB, nullable | Type-specific params (e.g. points-per-roll-threshold, pity-timer curve) |
| `source_updated_at` | Timestamp | Last sync from OSRS Wiki |

### `drop_rate_sync_log` — new
Tracks the periodic wiki re-sync job rather than a one-time seed, since Jagex hotfixes rates occasionally.
| Column | Type |
|---|---|
| `id` | UUID, PK |
| `ran_at` | Timestamp |
| `items_updated` | Integer |
| `items_flagged_for_review` | Integer — rate changed >X% since last sync, needs human confirmation before auto-applying |

---

## 2. Calculation Engine — per `distribution_type`

Each type gets its own pure function; the edge function dispatches on `drop_rates.distribution_type`. v1 implements 2.1 fully, 2.2–2.3 with a documented approximation, 2.4 marked unsupported and excluded from luck displays (rather than silently wrong).

### 2.1 `flat_geometric` (v1 fully supported)
Classic independent per-kill roll (Zulrah uniques, Vorkath head, most boss tables).
```
P = 1 - (1 - numerator/denominator) ^ kc_received
```
Same as original spec. Covers the majority of trackable content.

### 2.2 `points_based` (v1 approximation)
Raids uniques (CoX, ToB, ToA) — chance scales with points/deaths, not flat KC.
- Store `roll_context` (points earned that raid) alongside `kc_received`.
- v1: approximate using *average points per raid* pulled from Wiki metadata rather than true per-raid roll probability, and clearly label the luck % as "estimated" in the UI.
- Flag as a fast-follow: true calculation needs the actual points-to-chance curve per raid, which is more involved than a single denominator.

### 2.3 `streak_adjusted` (v1 approximation)
Pity-timer / dry-streak-boost mechanics (DK's rings, some pets).
- Use `kc_at_previous_drop` to reconstruct the streak-adjusted probability curve from Wiki-documented thresholds (stored in `metadata`).
- Falls back to flat geometric with a disclaimer if the curve isn't in `metadata` yet.

### 2.4 `multi_roll` / `unsupported`
Excluded from luck % display in v1; shown as "not yet supported" rather than computing a misleading flat-geometric number.

### Global percentile (unchanged logic, corrected grouping)
Percentile query groups by `(item_id, source_name)`, not `item_id` alone, since the same item can drop from multiple sources with different rates.

**Survivorship bias handling:** "Driest player" leaderboards are computed two ways:
1. `driest_obtained` — driest among players who *have* the item (original spec).
2. `driest_in_progress` — `current_kc - last_known_drop_kc` for players who don't have it yet, using `boss_kc`. This one is arguably more meaningful and should be the default tab.

---

## 3. Edge Functions (interface only — implementation is Phase 2)

- **`/ingest-drop`** — validates `install_token`, runs anti-cheat checks (§4), inserts into `collection_log_drops`.
- **`/get-player-luck`** — dispatches per-item calculation by `distribution_type`, returns per-item P plus overall summary (most spooned / driest). **This is the only endpoint that ships user-facing output in v1.**
- **`/leaderboard`** — returns both `driest_obtained` and `driest_in_progress` variants per item. **Schema, queries, and RLS are built and tested in Phase 1, but this endpoint is not called by the frontend and not documented publicly until solo player stats (`/get-player-luck` + profile page) ship. Gate behind a feature flag so it can't be hit accidentally.**

## 3a. Wiki Data Sourcing

- **`flat_geometric` rates**: scraped programmatically via the MediaWiki API against the OSRS Wiki's structured drop-table data (sourced from RuneLite Loot Tracker aggregation + datamined drop code). This covers the majority of bosses (GWD, Zulrah, Vorkath, etc.) and can run as the periodic `drop_rate_sync_job`.
- **`points_based` metadata** (CoX/ToB/ToA uniques): **not** scraped — the wiki documents these as prose/formulas, not structured fractions. These get hand-transcribed into `drop_rates.metadata` as a one-time manual data-entry task per raid, then re-checked only when Jagex patches drop mechanics (rare).
- **`streak_adjusted` metadata**: same manual-transcription treatment as points-based, since pity-timer curves are also documented as prose on individual item/monster pages.

---

## 4. Anti-Cheat / Security (scoped to schema + validation rules)

- Replace shared plugin API key with **per-`account_hash` install tokens**, minted automatically on first plugin run (plugin silently requests a token from a `/register` endpoint — no manual claim step required from the player), stored on `players.install_token`.
- Insert validation: reject `kc_received` > `boss_kc.current_kc` at submission time; reject if `date_submitted` is more than N days after a plausible `date_received`; rate-limit inserts per `account_hash` (e.g. max 20/hour).
- RLS: inserts require matching token; leaderboard reads only include rows where `players.leaderboard_opt_in = true`.

---

## 5. Phase 1 Deliverables & Acceptance Criteria

| Deliverable | Acceptance criterion |
|---|---|
| SQL migration for all 5 tables above | Runs clean on fresh Supabase project; constraints verified with test inserts |
| RLS policies | Insert blocked without valid token; leaderboard read excludes opted-out players |
| `flat_geometric` calculation function | Matches hand-calculated CDF values for 3 known drop rates |
| `points_based` / `streak_adjusted` stub functions | Return clearly-labeled "estimated" results, don't crash on missing metadata |
| Wiki sync job (basic version) | Populates `drop_rates` for GWD, Raids, Zulrah, Vorkath; logs to `drop_rate_sync_log` |
| Percentile / leaderboard queries | Grouped by `(item_id, source_name)`; both `driest_obtained` and `driest_in_progress` return correct results on seeded test data |

---

## Decisions (resolved)
1. **Wiki scraping**: yes for `flat_geometric`, hand-transcribed for `points_based`/`streak_adjusted` — see §3a.
2. **Leaderboard rollout**: build the full schema/queries in Phase 1, keep the `/leaderboard` endpoint unexposed (feature-flagged off) until solo player stats ship. Solo stats (`/get-player-luck` + profile page) are the v1 priority.
3. **Token minting**: automatic, via a `/register` call the plugin makes silently on first run. No manual claim flow.

## Updated v1 priority order
1. Schema (this doc) + `flat_geometric` calculation engine.
2. Wiki sync job for `flat_geometric` rates; manual metadata entry for a small starter set of `points_based`/`streak_adjusted` items.
3. `/ingest-drop` + `/register` + `/get-player-luck` — enough for a player to see their own luck stats end-to-end.
4. Leaderboard schema/queries built and tested, but **not** wired to any public endpoint or UI.
5. (Later phase) Flip the leaderboard feature flag on once solo stats are stable.
