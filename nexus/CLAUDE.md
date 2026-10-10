# NEXUS — D&D Campaign Tracker

Static multi-page web app for tracking a tabletop campaign: party roster, treasury, loot, session log with an NPC index, and a combat reference sheet. It's served by GitHub Pages at https://nreaver1.github.io/nexus/ from the `nexus/` folder of the `nreaver1.github.io` monorepo. There's no build step, no framework and no package.json.

## Stack

- **Frontend:** plain HTML pages with inline `<script>` blocks, plus two shared scripts loaded as globals (no ES modules).
- **Backend:** Supabase Postgres, reached directly through the PostgREST REST API with the **anon key** (`js/nexus-config.js`). There's no Supabase SDK, no auth and no server code.
- **Fonts:** Google Fonts (Orbitron, Share Tech Mono, Rajdhani). Sci-fi "terminal" theme, dark only.
- **Tests:** Node's built-in runner, `node --test tests/nexus.test.js` (Node 22, zero dependencies).

## Layout

```
index.html            Dashboard: module cards + summary stats pulled from every table
party-roster.html     Characters, abilities, skills/saves, HP, conditions (under Stats), rests, item effects, Spells tab
treasury.html         Custom currencies, gain/spend ledger, splits, per-member vaults, net worth
loot-tracker.html     Items, rarity, holder, attunement (max 3), quantity, stat effects, import/transfer, SRD name search
session-log.html      Sessions, "moments" (events), quests, NPC index, ^slug citations
combat.html           Per-character combat sheet: attacks/spells ranked by expected damage vs the DM's target
admin.html            Password gate, term renaming, module toggles, site lock, snapshot export/restore, danger zone
seed-session-log.html Dev tool that seeds or wipes session-log demo data (own CSS + DB wrapper; admin-password gated)
js/nexus-config.js    Supabase creds, `db` REST wrapper, nexusConfirm, terms (t()), module toggles,
                      site lock, setLoading, admin password prompt, requireAdmin, nexusGate
js/nexus-utils.js     Pure helpers (uid, esc, fmt, 5e math, combat math, treasury math, loot emoji, slugify)
                      + showToast + buildSidenav. Exports via module.exports for tests.
js/nexus-srd.js       dnd5eapi.co (2014 SRD) client: name search dropdown (attachSrdSearch) + pure mappers
                      srdSpellToOption / srdWeaponToOption / srdItemToLoot / parseSrdItemEffects (tested),
                      plus CampaignLibrary (campaign_library table) and its pure library* helpers
js/nexus-combat-editor.js  CombatEditor: the one add/edit modal for combat_options, used by combat.html
                      and the roster Spells tab. Load order: demo, auth, config, utils, srd, combat-editor.
js/nexus-cite.js      ^npc-slug citations on every page: loadCiteNpcs/setCiteNpcs, renderWithCitations,
                      the ^ autocomplete (auto-attached to any [data-cite] field). Loaded right after utils.
js/nexus-auth.js      Sign-in: Supabase Auth emailed links, session in localStorage, token refresh, role
                      lookup in campaign_members, and nexusAccess() (who may edit). Loaded between demo and config.
js/nexus-demo.js      Demo mode (?demo): in-browser DemoStore with the same API as `db`, schema read from
                      sql/supabase_setup.sql at runtime. Loaded right BEFORE nexus-config.js on every page.
demo/demo-data.json   The demo campaign (an Admin snapshot). demo/img/ holds its portraits.
css/nexus.css         One shared stylesheet (~3.8k lines); theme tokens on :root
tools/stamp-assets.js  Cache-busting: stamps every js/ and css/ link in the pages with ?v=<file hash>
sql/                  Hand-run SQL for the Supabase SQL Editor (no migration tool)
tests/nexus.test.js   ~10k lines, ~1480 tests
.github/workflows/    Leftover test.yml that never runs. The live CI is ../.github/workflows/nexus-ci.yml at the repo root
```

## Page conventions

Each module page follows the same pattern:

1. `<script src="js/nexus-demo.js">`, `js/nexus-auth.js`, `js/nexus-config.js`, then `js/nexus-utils.js` (order matters: config picks the demo store and starts sign-in, and utils call `isModuleEnabled` from config).
2. `<div id="nexus-nav-root">`, filled by `buildSidenav('<this-page>.html')`.
3. An async `boot()`/`init()` that runs `Promise.all([loadModuleSettings(), loadTerms(), db.select(...)])`, then `buildSidenav`, `applyModuleVisibility()`, `applyReadOnlyBanner()` and `if (!enforceModuleGuard('<moduleKey>')) return;`, and then renders.
4. State lives in page-level globals (`members`, `items`, `sessions`, `events`, `npcs`, `ledger`, ...). Every mutation writes to Supabase and then patches the local array and re-renders. There's no realtime sync, so other tabs/users only see changes after a reload.
5. Every function that writes to the DB starts with `if (!(await nexusGate())) return;`. GM-only actions (settings, danger zone, snapshots, DM target) are wrapped in `requireAdmin(fn)`. Both decide via `nexusAccessNow()`; the database enforces the same rules, so these are UX, not security.
6. Rendering is template-string `innerHTML`. **All user text must go through `esc()`**, including attribute values like `src`, `title` and `style`. Never interpolate user strings into inline JS such as `onclick="f('${esc(x)}')"`: the browser decodes entities before running the handler, so escaping doesn't help there. Use `data-member="${esc(m.name)}" onclick="f(this.dataset.member)"` instead (tests enforce this for member names).
7. Modals: give the backdrop `class="modal-backdrop"` (or `data-backdrop`) and close on `e.target === backdrop`. The drag guard in nexus-config.js stops a press inside the modal released on the backdrop from closing it, for every modal; don't add per-page mousedown tracking.
8. Confirmations use `await nexusConfirm({...})`, never `confirm()` (a test enforces this in some modules). Toasts use `showToast()`. Buttons use `setLoading(btn, true/false)`.
9. Use CSS variables (`var(--cyan)`, `var(--border)`, ...), not hex values. The tests check for hard-coded colors in places.

## Data model (Supabase)

IDs are client-generated text strings from `uid()` (`'_' + 9 base36 chars`).

| Table | Notes |
|---|---|
| `party_members` | `abilities`, `combat` (ac, hp, hpcur, speed, ...), `proficiencies` are JSONB. `photo` is a base64 data URL stored inline. |
| `loot_items` | `holder` is a free-text member **name** (not an id). The canonical holders are `'Party'` (applies effects to everyone) and `'Party Vault'`. `stat_effects` is JSONB `[{stat,type,value,damageType?}]`; `type` is `bonus`, `penalty`, `set` (flat stat: "at least value", highest wins, only for `SETTABLE_STATS`), `advantage` or `disadvantage`. The JS maps `qty` to the `quantity` column. |
| `treasury_currencies` | `rate` converts to the base currency; `sort_order`. |
| `treasury_ledger` | `type` is `'gain'` or `'spend'`, `coins` is JSONB `{currencyId: amount}`, `ts` is epoch ms, `member_name` (nullable) is a member-vault transaction. Balances are **always derived** with `recalcVaultFromLedger`; nothing stores them. |
| `session_log` | `quests` and `session_npcs` are inline JSONB arrays. |
| `session_events` | FK to session_log with cascade. Saved by delete-all-then-reinsert for the session (non-atomic). |
| `npcs` | `slug` is unique. `first_seen` is an FK with set null. |
| `combat_options` | One attack/spell/feature per row. **Also the spell list**: the roster Spells tab shows `kind='spell'` rows (with `school`, `components`, `material`, `casting_time`, `duration`, `concentration`, `ritual`, `description`, `prepared`, `srd_index`). FK `member_id` → party_members (cascade; keyed by **id**, not name), `loot_item_id` → loot_items (set null). `action` action/bonus/reaction, `resolve` attack/save/auto/none, `ability` str..cha or `spell`, `spell_level` 0 = cantrip. |
| `campaign_library` | Hand-typed non-SRD content (Tasha's, homebrew) shared by every name search. `kind` spell/weapon/item/feature, `name`, `data` JSONB in the form's shape (combat_options fields, or loot fields for items). Unique on `(kind, lower(name))`; the app updates by name instead of duplicating. |
| `nexus_settings` | key/value JSONB: `term_mappings`, `module_enabled`, `site_lock` (legacy only), `combat_target` (`{ac, save}`). GM-only writes. |
| `campaign_members` | `email` (lowercase, PK), `role` `gm`/`player`. Created by `sql/supabase_auth.sql`, **not** in setup.sql, snapshots or the demo. Managed in the SQL Editor; signed-in users can read only their own row. |

Member names are the join key between the roster, loot `holder` and ledger `member_name`. Renaming a member doesn't cascade.

Conditions (party roster) and the collapse state of the effects panel live in **localStorage**, not the DB, so they're per-browser.

### SQL files
- `sql/supabase_setup.sql`: the full install (all tables + settings + session log).
- `sql/supabase_session_log.sql`, `supabase_settings_only.sql`, `supabase_tx_member.sql`, `supabase_loot_quantity.sql`, `supabase_combat.sql`: incremental add-ons for older installs. They overlap the setup script. `supabase_combat.sql` creates the table **and** ends with `add column if not exists` lines, so re-running it upgrades an older combat_options. `supabase_library.sql` creates campaign_library.
- `sql/supabase_auth.sql`: run after the setup script. Replaces the open `public_all` policies: anyone reads, editors in `campaign_members` write, GM-only `nexus_settings`. **A new table in setup.sql must be added to its table list** (a test checks), or it stays publicly writable.
- When you add a column, add it to `supabase_setup.sql` **and** ship an `add column if not exists` file. A test checks that the setup script has the columns the pages write.

## Feature notes

- **Terms:** `t('partyRoster')` returns the display label, which admins can rename from Admin. These change display text only; DB values (e.g. `'Party'`, `'Party Vault'`) stay canonical. `TERM_DEFAULTS` (config) and `TERM_DEFS` (admin.html) must stay in sync, and a test checks this.
- **Module toggles:** `MODULE_DEFS` / `MODULE_ENABLED` in config, plus `NAV_LINKS` / `NAV_MODULE_KEY` in utils. Adding a module means updating all four, plus `index.html` cards and admin.
- **Citations:** `^npc-slug` works in every notes box: session summaries/moments/quests, NPC notes, Treasury description + notes, Loot descriptions, roster bio + loot desc, combat editor notes/description. Pure parts are in utils (`renderCitations`, `citeTokenAt`, `citeMatches`, `citedSlugs`, `DISP_CHIP_COLOR`); `js/nexus-cite.js` holds the NPC list and the autocomplete. To add a box: give the field `data-cite`, render the saved text with `renderWithCitations(text)` instead of `esc(text)`, and make sure the page's boot calls `loadCiteNpcs()` (the session log calls `setCiteNpcs(npcs)` from `buildNpcMap` instead). Chips link to `session-log.html?npc=<slug>`, which opens that NPC; on the session log itself they jump in place.
- **5e math:** `abilityMod`, `computeCheck`, `computeNetEffects` (aggregates item effects for a member plus `'Party'` items, with a per-damage-type breakdown). Note party-roster.html still defines its own `computeNetEffects(memberName)` that shadows the utils one on that page.
- **Combat (2014 5e):** all maths is in utils: `parseDice`, `effectiveProf` (max of stored `prof` and the level table, plus `prof_bonus` items; the roster uses it too), `combatBreakdown` (to-hit/DC/damage with labelled parts), `expectedDamage`, `rankCombatOptions` (top 3 + `bestAtWill`). `combatContext(member, items, option, target)` builds the per-option context: attack/damage effects on weapon-type loot (`isWeaponItem`) only count for options linked to that weapon via `loot_item_id`. Extra Attack is `party_members.combat.attacks`. The DM target is one AC + one save bonus for everyone, edited behind `requireAdmin`. Slots, charges and initiative are deliberately not tracked. Unprepared leveled spells (`isPrepared`) are listed but not ranked; a spell with no Spell DC/Atk on the roster shows "not set" (`breakdown.dc.missing`).
- **Flat stats:** `effectiveStat(base, net[stat])` = max(base + bonus − penalty, set). The roster ability/AC/speed boxes, `computeCheck` and combat ability mods all use it. party-roster.html's own net-effects copies record `set` too.
- **SRD lookup:** only SRD 5.1 content exists in the API (no Booming Blade, Xanathar's, etc.); anything else is typed in once and saved to the **campaign library** ("Save to the campaign library" checkbox in the shared editor and the Loot modal, on by default for new hand-typed entries, hidden after an SRD pick). Search kinds `campaign:spell|weapon|item|feature` read the library; features search the library only. Admin has a Campaign Library card to remove entries; snapshots include the table. Item effects come from regex over the description text, so they're shown in the form to confirm before saving. Roll20 has no API and can't be used.
- **Spells tab (roster):** reads `combat_options` at boot; add/edit go through `CombatEditor` with `kind: 'spell'`; Prepared toggles write straight to the row. Adding a weapon from the editor can create the Loot Tracker item (held by the character) and link it.
- **Sign-in / access:** `nexusAccess()` in nexus-auth.js has three modes. In `demo` everything is allowed. In `auth` (the `campaign_members` table exists) the role decides: gm/player can edit and gm does admin. In `legacy` (supabase_auth.sql never run) the old site lock + `NEXUS_ADMIN_HASH` password apply. Signing in emails a link (`/auth/v1/otp`) that returns to the current page. `nexusAuthInit` picks the tokens up from the `#access_token=…` fragment, saves them to localStorage `nexus_auth`, clears the fragment, and refreshes them before expiry. `db._headers()` sends the user's token, so RLS sees their email. In auth mode, Admin hides the Site Access and Admin Password cards and asks for GM sign-in instead.
- **Email limits:** Supabase's built-in mailer only delivers to members of the Supabase team, a few per hour. Players need an SMTP provider configured before they can sign in. Supabase → Authentication → URL Configuration must list `https://nreaver1.github.io/nexus/**` (and the Site URL), or links land on localhost.
- **Snapshot:** Admin exports all tables to JSON. Restore deletes every row and reinserts per table (not transactional).

## Testing

**After editing anything in `js/` or `css/`, run `node tools/stamp-assets.js`.** It updates the `?v=<hash>` on every page's script/stylesheet links so browsers don't mix a fresh file with a cached old one (GitHub Pages caches for 10 minutes). The "Cache-busting asset stamps" tests fail if a link is stale. New pages and new scripts just need the plain `js/…` path; the tool adds the stamp.

```
cd nexus && node --test tests/nexus.test.js
```

The suite mixes:
- real unit tests of `js/nexus-utils.js` exports, and
- **source-shape tests** that `readFileSync` the HTML/CSS and regex-match for patterns (e.g. "calls enforceModuleGuard", "no hardcoded #0ef0d0"), plus **replica tests** that copy a function from an HTML page into the test file and test the copy.

When you change page code, run the suite: shape tests break on renames and refactors. Replica tests do NOT catch changes to the real function, so prefer moving logic into `nexus-utils.js` and testing it there.

## Running locally

Any static server from the `nexus/` folder, e.g. `npx serve .` or `py -m http.server`. Don't open pages via `file://`: demo mode has to fetch its data files. Without `?demo`, everything talks to the live Supabase project, which holds the **real campaign**, so local runs write to production data. Use `?demo` for development.

## Demo mode

The public "Live demo" links (portfolio `../index.html`, `../README.md`) open `https://nreaver1.github.io/nexus/?demo`. The plain `/nexus/` URL is the real campaign on Supabase.

- `?demo` on any page turns demo mode on for that browser tab (sessionStorage `nexus_demo`), so plain sidenav links stay in demo. `?demo=off` turns it off. A violet banner shows while it's on.
- `nexus-config.js` sets `NEXUS_DEMO` and `const db = NEXUS_DEMO ? createDemoDb() : _supabaseDb`. No page code knows the difference. The demo store never contacts Supabase.
- `DemoStore` loads `demo/demo-data.json` plus the table definitions parsed from `sql/supabase_setup.sql` (primary keys, column defaults, FK cascade/set null). It rejects unknown columns and tables the way PostgREST does, so schema drift shows up in the demo too.
- Visitors' edits live in sessionStorage (`nexus_demo_db`) for that tab only. "Reset demo" in the banner drops them. When `demo-data.json` is republished (new `exported_at`), stale tab copies reset themselves.
- In demo mode the site lock is off, and `requireAdmin` and the Admin page skip the password. They never set the real `nexus_admin` flag. The seed tool writes to the demo copy.

**Updating the demo when a module changes** (CI enforces this):
1. Add the column/table to `sql/supabase_setup.sql` as usual (the demo picks it up automatically), and add new tables to `SNAPSHOT_TABLES` in admin.html.
2. Serve the site locally and open `/nexus/?demo`, then add sample data for the new feature through the normal UI.
3. Admin → Export Snapshot, and save the file over `nexus/demo/demo-data.json`. New portraits come out as `data:` URLs: save them as small JPEGs in `demo/img/` and point `photo` at `demo/img/<file>.jpg`. File names must not start with `_`: GitHub Pages (Jekyll) won't serve them.
4. Run the tests. The "Demo mode" suite fails if any table in the setup script has no demo rows, a row uses a column that doesn't exist, an FK or holder/ledger name dangles, a photo is inline, the file passes 400 KB, or a page's `db.select`/`deleteWhere` uses a query shape DemoStore doesn't support.

Hand-editing `demo-data.json` is fine too: it's a plain snapshot. Keep `exported_at` a new number whenever the content changes, so open demo tabs pick it up.

## Known issues / guardrails

- With supabase_auth.sql installed, writes are enforced by RLS. Without it (fresh installs), security is client-side only, as before.
- `seed-session-log.html` is still deployed publicly. Its buttons require the admin password, but like everything else that's UI-only. In demo mode it seeds the demo copy.
- `nexusConfirm` escapes all of its text fields itself, so pass plain text, never HTML.
- Record ids (`m.id`, `s.id`, ...) and `m.color` are still interpolated into inline handlers and `style` attributes unescaped. They're safe only while every row comes from the UI; a row written straight to the API could inject. Moving to `data-*` + `addEventListener` would close it.
- `nexus/.github/workflows/test.yml` is a dead leftover and can be deleted.
