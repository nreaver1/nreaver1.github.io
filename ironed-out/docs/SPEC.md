# Ironed Out – Build Spec (v1)

Status: approved design, ready to build. Design canvas (owner-only link, ask Mike for access):
https://claude.ai/artifact/JgbWRSLzQmtgCrwtmz5F2F — source copies are in `/design`.

---

## 1. Product summary

|                   |                                                                                                                               |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Name              | Ironed Out ("getting the details ironed out")                                                                                 |
| Platform          | Web first, mobile-first responsive (installable PWA later)                                                                    |
| Organizer         | Has an account (email + password). Creates crews and outings.                                                                 |
| Invitee           | Anyone with the outing link. Claims a spot with name + phone + SMS code. No password needed. Can create a full account later. |
| Out of scope (v1) | Payments / splitting fees, native apps, booking the actual tee time with the course                                           |

The app is a **coordination layer**: the organizer books with the course however they normally do,
then enters the outing in Ironed Out. Direct booking-platform integrations come later via the
partner API (§7) and course-provider adapters (§8).

## 2. Core concepts

- **User** – account holder (email/password). May also have a verified phone.
- **Player** – anyone who can occupy a slot. Linked to a User when they have an account; otherwise
  identified by verified phone. Guests ("+1") are slots owned by a player but labeled as their guest.
- **Crew** – a named group of users ("Saturday Hackers"). Joined via crew invite link.
- **Outing** – one golf event: course, date, price per player (display only), note, organizer,
  optional crew. Contains 1–6 **tee times**.
- **Tee time** – a start time with capacity 2–5 (default 4). Has **slots** 0..capacity-1.
- **Invite link** – shareable link to an outing. Anyone with the link can view and claim.
- **Outing event** – append-only change log entry for an outing.

## 3. Screens & flows (match the design)

1. **Welcome** – logo, tagline, illustration, "Create an account" / "I already have one".
   Note: invite links never require this screen.
2. **Sign up** – name, email, password (min 8, check against breached-password list). **Log in**,
   **Forgot password** (emailed single-use reset link, 30-min expiry).
3. **Home** – greeting, "Next up" outing card (course, date, tee time summary, one dot per spot,
   "X of Y spots open"), "Open invite", "Share link", "New outing", crew list.
4. **Crew** – members (pending invites shown dashed), copyable crew invite link, "Start an outing
   with this crew", "Make a new crew".
5. **Alerts (settings)** – verified phone; per event type a Text and Email toggle:
   someone grabs a spot, someone drops out, tee times change, day-before reminder, 2-hours-before
   reminder. Quiet hours (default 10 PM–7 AM local; texts are delayed, not dropped). STOP wording.
6. **New outing**
   1. Where: course search box; scope toggle "Within 2 hrs of Baltimore" (default) / "All courses";
      results show name, town, approx drive time; tap to select.
   2. When: date pills (next weekends) – real build uses a date picker defaulting to upcoming weekend.
   3. Tee times: first tee time (± interval), number of tee times (1–6), players each (2–5),
      minutes apart (8/9/10/12). Live preview: "7:40 · 7:50 · 8:00 AM", "12 spots to fill".
   4. Details: cost per player (display only, "paid at the course"), note for the crew.
      → "Create & get the link". Organizer auto-fills slot 1 of the first tee time.
7. **Share** – copyable link, preview of how it unfurls in a group chat, "Text it to the group"
   (uses native share sheet / `sms:` link on mobile), "See the invite page".
8. **Invite page** (the most important screen)
   - Hero: illustration, organizer, course, address, date, tee time summary, price, note.
     "Locked in" stamp when locked.
   - **Since you last looked banner** – shown to a returning viewer when events happened since
     their last visit (e.g. "Dave dropped out. A spot opened at 7:50 AM.", "Mike added an 8:00 AM
     tee time.", "Jen is bringing a guest at 7:40."). Newly opened slot is highlighted
     ("Just opened!"), new tee times get a "new" tag. Buttons: "Grab the [time] spot" (first newly
     opened slot) and "Got it" (marks seen). If nothing changed and they're in: "You're in. No
     changes since you joined."
   - Tee sheet: one card per tee time, "N of M filled", 2-column slot grid. Filled slot: initials
     avatar, name, tag (organizer / guest). Open slot: dashed "Open · grab it".
   - Friend actions: tap open slot → claim sheet; "Drop out" on own slot (also releases their guests);
     "Add to my calendar" (.ics download + Google Calendar link).
   - Organizer actions: remove a player (they get a text), add/remove an empty spot on a tee time
     (capacity 2–5), delete an empty tee time, add another tee time (last + interval),
     lock/unlock outing (locked = no claims, no drop-outs, no removals), share link again, delete
     the whole outing (confirm sheet; cascades its tee sheet, links and events; audit row kept).
9. **Claim sheet** – Step 1: name, mobile number, "Bringing a buddy?" stepper (max = open spots − 1),
   "Text me a code", consent line. Step 2: 6-digit code (autocomplete=one-time-code, 10-min expiry,
   5 attempts, resend with cooldown). Step 3: celebration (ball drops in cup), "You're in for 7:50 AM,
   plus 1 guest. We'll text you if anything changes."
   Guests fill remaining open slots in the same tee time first, then the next tee times.
   A returning verified device skips the code (signed device cookie, 90 days).
10. **Link preview (Open Graph image)** – 1200×630 generated per outing: course, date, times,
    "N of M spots open. Tap to grab one". Regenerate (cache-bust) when spot count changes.

Text message copy examples are in `design/TextAlerts.dc.html`.

## 4. Data model (PostgreSQL)

All ids are UUIDv7. All tables have `created_at`, `updated_at` (timestamptz). Every tenant-owned
table has `tenant_id` (the consumer app is tenant `ironed-out`); enforce with Postgres Row-Level
Security keyed on `app.tenant_id` set per transaction.

```
tenants(id, slug, name, status)
users(id, tenant_id, email citext unique per tenant, password_hash, name, phone_e164 null,
      phone_verified_at null, email_verified_at null, mfa_secret_enc null, disabled_at null)
sessions(id, user_id, token_hash, expires_at, ip, user_agent, revoked_at)
players(id, tenant_id, user_id null unique, display_name, phone_e164 null, phone_verified_at null)
crews(id, tenant_id, name, owner_user_id)
crew_members(crew_id, user_id, role enum(owner,member), status enum(active,pending), PK(crew_id,user_id))
crew_invites(id, crew_id, kind enum(link,personal), token_hash unique, invitee_name null,
             invitee_email null, invitee_phone null, status enum(open,accepted,declined,canceled),
             accepted_by null, expires_at, revoked_at, created_by)
  -- kind=link: the crew's shareable link. kind=personal: one person invited by name + phone or
  -- email; shown as "invited" (dashed) until they join. Added 2026-10-02 with the owner's OK.
courses(id, name, address, city, region, country, lat, lng, is_public bool,
        source enum(seed,provider,manual), external_ids jsonb, geog geography(Point) )
outings(id, tenant_id, organizer_player_id, crew_id null, course_id, play_date date, timezone,
        price_cents null, currency, note, locked_at null, external_ref null, version int)
tee_times(id, outing_id, starts_at timestamptz, capacity smallint check 2..5, sort smallint)
slots(id, tee_time_id, position smallint, player_id null, guest_of_player_id null,
      claimed_at null, UNIQUE(tee_time_id, position))
  -- invariant: a player holds at most one non-guest slot per outing (enforce in the claim
  -- transaction + partial unique index via outing_id denormalized onto slots)
invite_links(id, outing_id, token_hash unique, expires_at null, revoked_at null, created_by)
outing_events(id bigserial, outing_id, type, actor_player_id null, payload jsonb, created_at)
  -- types: outing_created, slot_claimed, slot_released, player_removed, guest_added,
  --        tee_time_added, tee_time_removed, capacity_changed, outing_updated, locked, unlocked
outing_views(outing_id, viewer_key, last_seen_event_id, PK(outing_id, viewer_key))
  -- viewer_key = player_id when known, else hash of signed anonymous device id
notification_prefs(player_id, event_type, sms bool, email bool, PK(player_id,event_type))
notification_settings(player_id, quiet_start time, quiet_end time, timezone, sms_opted_out_at)
verification_codes(id, phone_e164, code_hash, purpose, expires_at, attempts, consumed_at)
api_clients(id, tenant_id, name, client_id unique, secret_hash, scopes text[], revoked_at)
webhook_endpoints(id, tenant_id, url, secret_enc, events text[], disabled_at)
webhook_deliveries(id, endpoint_id, event_id, status, attempts, next_attempt_at, last_error)
idempotency_keys(key, client_id, request_hash, response jsonb, created_at, PK(client_id,key))
audit_log(id, tenant_id, actor, action, target, ip, meta jsonb, created_at)
```

**Claim transaction** (pseudo):
`BEGIN; SET LOCAL app.tenant_id; SELECT outing FOR UPDATE (check not locked);
SELECT slot FOR UPDATE (check empty); check player has no other non-guest slot; assign;
assign guests to next empty slots (same tee time first); INSERT outing_events; COMMIT;`
then enqueue notifications + webhooks. If the slot was taken meanwhile, return 409 with the current
tee sheet so the UI can offer the next open spot.

**Banner**: `GET /outings/:id` returns `events_since_last_seen` (collapsed into human-readable
items, max 5, newest first) plus `last_event_id`. `POST /outings/:id/seen {last_event_id}` on
"Got it" or after a successful claim.

## 5. Notifications

- Fan-out job per outing event → for each participating player (and organizer), check prefs,
  opt-out and quiet hours → enqueue SMS/email. Coalesce bursts (same outing, 2-minute window)
  into one text.
- Reminders: scheduled jobs at play_date − 1 day (6 PM local) and tee time − 2 h.
- Inbound SMS webhook handles STOP/START/HELP (Twilio Advanced Opt-Out) and records
  `sms_opted_out_at`.
- Every SMS starts with "Ironed Out:" and includes the outing short link.
- Compliance: A2P 10DLC registration before launch; consent text shown at claim (§3.9).

## 6. Security (enterprise baseline)

- Passwords: Argon2id (memory ≥ 19 MiB, t=2), breached-password check (k-anonymity HIBP), rate
  limits on login/reset per IP and per account, generic error messages.
- Sessions: httpOnly, Secure, SameSite=Lax cookies; rotate on login; server-side revocation.
  Optional TOTP MFA for organizers; required for partner admin console.
- CSRF protection on cookie-authenticated mutations; strict CORS on `/api/v1` (partners use
  bearer tokens, not cookies).
- Tokens (invite, crew, reset, device): 128-bit random, base62, only SHA-256 stored.
- Verification codes: 6 digits, hashed, 10-min TTL, 5 attempts, per-phone and per-IP limits.
- Rate limiting + bot protection on claim and code endpoints (e.g. Turnstile after N attempts).
- PII: phone numbers encrypted at rest (pgcrypto or app-level envelope encryption with KMS);
  invite page shows first name + last initial only to non-members; full phone never exposed.
- Headers: CSP (no inline scripts), HSTS, X-Content-Type-Options, Referrer-Policy, frame-ancestors
  (allow-list partner domains for the embeddable widget only).
- Audit log for auth events, organizer removals, locks, API client and webhook changes.
- Data retention: delete verification codes after 24 h; purge outings 18 months after play date
  (configurable per tenant); user self-serve account deletion + export.
- Path to SOC 2: centralized logging, least-privilege DB roles, dependency scanning, secrets in a
  manager, infra as code.

## 7. Partner API (`/api/v1`)

- Auth: OAuth 2.0 client credentials → short-lived JWT access tokens (15 min) with scopes:
  `outings:read`, `outings:write`, `players:read`, `webhooks:manage`. Tenant derived from the client.
- Conventions: JSON, cursor pagination, ISO-8601 timestamps, `Idempotency-Key` required on POST,
  RFC 9457 problem+json errors, `X-Request-Id`, per-client rate limits with `RateLimit-*` headers,
  versioned by URL (`/v1`), OpenAPI 3.1 published at `/api/v1/openapi.json`.
- Endpoints (same ones the web app uses):
  ```
  POST   /outings                         create outing with tee times (partner may pass external_ref
                                          = their reservation id and pre-filled players)
  GET    /outings/:id                     outing + tee sheet (+ events since last seen for viewers)
  PATCH  /outings/:id                     note, price, lock/unlock
  POST   /outings/:id/tee-times           add tee time
  PATCH  /tee-times/:id                   capacity / start time
  DELETE /tee-times/:id                   only if empty
  POST   /outings/:id/invite-links        create link (optional expiry)  DELETE /invite-links/:id
  POST   /slots/:id/claim                 { player, guests }   409 if taken
  POST   /slots/:id/release               drop out / organizer remove
  POST   /outings/:id/seen                mark events seen
  GET    /courses?query=&near=lat,lng&radius_min=120&scope=near|all
  POST   /verification/start | /verification/check   phone OTP
  CRUD   /crews, /crews/:id/invites
  CRUD   /webhooks
  ```
- Webhooks: events mirror `outing_events` (`outing.created`, `slot.claimed`, `slot.released`,
  `tee_time.added`, `outing.full`, `outing.locked` …). Signed with HMAC-SHA256
  (`Ironed-Signature: t=…,v1=…`), retries with exponential backoff for 24 h, replay protection.
- Embeddable widget (later milestone): `<script>` that renders an "Invite your group" button on a
  partner's booking confirmation page and calls `POST /outings` with their reservation details.

## 8. Course data

- v1 seed: public courses within ~2 h of Baltimore (list in `design/Main.dc.html` → `courses()`;
  drive times there are approximations—recompute from lat/lng). Also include a few famous public
  courses nationwide so "All courses" isn't empty.
- Search: Postgres trigram index on name/city + PostGIS distance. "Within 2 hrs" ≈ 120-mile radius
  from the user's location (default Baltimore) until a drive-time API is added.
- `CourseProvider` interface (`search`, `getById`) with a `SeedProvider` now; national dataset
  provider to be chosen (licensing decision—flag to Mike, don't pick one).
- Booking-platform adapters (`GolfNowAdapter`, `ChronogolfAdapter`) are stubs implementing a
  `BookingPlatform` interface; real access requires partner agreements.

## 9. Design system (from the approved design)

- Fonts: **Caveat** 700 (display/headings), **Patrick Hand** (body, 17–22px). Google Fonts, self-host
  in production.
- Colors:
  - ink `#2B2A26` (text, all outlines)
  - paper `#FBF6E9` with faint dot grid (`#E9E0C9` 1px dots every 20px)
  - fairway `#3F7A3A` (primary buttons, on-state) · fairway-dark text `#2F5E2C`
  - light fairway `#6FA35F`, hills `#A8CC94`, green `#4E8B4A`, success bg `#E3EFD9`
  - flag red `#C0392B` (illustrations), red button `#B5361F`, red text `#A3301F`
  - sand highlight `#F7E3B5`, sun/"you" avatar `#F2C14E`
  - muted text `#5E574B`, dashed lines `#8A8270` / `#CFC5AE` / `#E3D9C2`
  - avatar pastels `#CFE3C2 #F3D9B1 #D3E1F2 #F2CBC2 #E2D6F0`
  - from the design: sky `#CFE6F2` (invite hero), warm card `#FFFDF7` (filled slot),
    chat bubble background `#F4F1EA` (share preview)
- Hand-drawn shapes: 2px ink borders with uneven radii, e.g.
  `border-radius: 14px 5px 13px 6px / 6px 13px 5px 14px`; cards `18px 6px 16px 5px / 6px 16px 6px 18px`.
- Buttons: min-height 48px, hard offset shadow `3px 3px 0 #2B2A26`, pressed state shifts 2px.
- Open slots: 2px dashed border; newly opened: sand fill + red dashed border + gentle wiggle.
- Illustrations: simple inline SVG (rolling hills, green, flag that waves, sun, cloud, ball with
  dashed flight path). No emoji, no gradients.
- Motion: flag wave, banner wiggle, ball-drops-in-cup on successful claim. Respect
  `prefers-reduced-motion`.

## 10. Milestones (check off as completed)

- [x] **M1 Foundation** – repo, Next.js + TS strict, lint/format, Drizzle + Postgres (docker compose),
      RLS tenant setup, design tokens + base components (Button, Card, Input, Pill, Stepper,
      Sheet), CI (typecheck, lint, test).
      _Done 2026-10-02. DB tests run on in-memory PGlite; the Docker Postgres path
      (`db:up` → `db:migrate` → `db:seed`) is exercised by the CI `migrations` job but has not
      been run on a dev machine yet._
- [x] **M2 Accounts** – sign up, log in, log out, password reset, sessions, rate limits, audit log.
      _Done 2026-10-02. Added tables not listed in §4: `password_reset_tokens` and `rate_limits`
      (Postgres fixed-window counters, so limits work on serverless). Email goes through Resend
      when `RESEND_API_KEY` is set, otherwise to an in-memory outbox (`/dev/outbox` in dev).
      CSRF: server actions only accept same-origin requests (Next.js checks Origin)._
- [x] **M3 Outings** – courses seed + search, New outing flow, Home, tee sheet data model,
      organizer controls (capacity, add/delete tee time, remove player, lock).
      _Done 2026-10-02. Additions to section 4: `courses.timezone` (turns local tee times into
      instants). `tee_times`, `slots`, `outing_events` and `outing_views` have no tenant_id, so
      their RLS policy is "outing visible to this tenant". Locking also freezes the organizer's
      structural edits (tee times, capacity, removals) until unlocked; note/price stay editable.
      Drive times are estimated as 6 min + 1.35 min per straight-line mile. Seed coordinates and
      addresses are approximate; verify before launch._
- [x] **M4 Invite & claim** – invite links, public invite page, phone OTP claim with guests,
      race-safe claim, drop out, device cookie, calendar export, OG preview image.
      _Done 2026-10-02. Invite tokens are derived from the link id with `APP_SECRET` (HMAC), so
      the organizer can see the link again; only the SHA-256 is stored. The device cookie is a
      signed value (player id + expiry), not a stored token, so it can't be revoked server-side
      before its 90 days are up. SMS demo mode: without Twilio keys the code is shown in the
      claim sheet and codes live in `verification_codes` (keyed hash, 10 min, 5 tries). With
      Twilio Messaging configured the same codes are texted as an ordinary message (changed
      2026-10-05 with the owner: Twilio Verify costs ~$0.05 more per code). All texts are
      normalized to GSM-7 (`src/server/notify/gsm.ts`) so typographic characters don't push a
      message into 70-character UCS-2 segments. Signed-in users and verified
      devices claim without a code. Phone parsing is US-first (other countries need a leading +)._
- [x] **M5 Change feed** – outing_events everywhere, "Since you last looked" banner, highlights.
      _Done 2026-10-02. Viewers we don't know yet get a random `io_anon` cookie; their
      `outing_views.viewer_key` is `anon:<sha256>`. The first visit only records a baseline (no
      banner). A viewer's own changes are left out; identical lines collapse; the cursor never
      moves backwards or past the newest event. The organizer sees the banner too (no grab button)._
- [x] **M6 Notifications** – prefs UI, SMS/email fan-out, coalescing, quiet hours, reminders,
      STOP handling.
      _Done 2026-10-02. Decided with the owner: a Postgres outbox table `notifications` instead of
      pg-boss (no always-on worker on Vercel). Rows are written in the same transaction as the
      outing event; change alerts for one player/outing/channel merge while pending (2-minute
      window). `/api/internal/dispatch` (Bearer `CRON_SECRET`) schedules reminders and sends
      what's due; GitHub Actions calls it every 5 minutes (`.github/workflows/ironed-out-dispatch.yml`
      at the repo root) and Vercel Cron daily as a backstop, plus a best-effort run right after
      each change. Removed players always get told (unless they replied STOP). The 2-hour
      reminder ignores quiet hours (an early tee time would otherwise miss it). Account holders
      verify a phone on the Alerts screen; phone-only players manage texts with STOP/START.
      Inbound texts: `/api/webhooks/twilio/sms` (signature-checked). In SMS demo mode texts are
      recorded as sent and shown on the Alerts screen; message bodies are stored without the link._
- [x] **M7 Crews** – crews, crew invite links, start outing from crew, notify crew on new outing.
      _Done 2026-10-02. Crew links live at `/g/<token>` (token derived from the invite id with
      `APP_SECRET`, only the hash stored; owners can make a new link). Joining needs an account;
      people without one sign up and come straight back to the invite. Members join as `active`;
      owners can also invite one person by name + phone or email (a `personal` crew invite): they
      get a text or email with their own join link and show as "· invited" until they join.
      Someone whose account email or verified phone matches sees the invite on Home (Join / No
      thanks); a personal link stops working once used, canceled, or after 30 days.
      `crew_members.status = pending` is unused (pending people live in `crew_invites`). Owners can remove members; an owner can
      leave only when alone, which deletes the crew. "New outing" alerts go by text when the
      member has a verified phone (respecting STOP and quiet hours), otherwise by email, and link
      to the outing's invite page. Notification kind `new_outing` added._
- [x] **M8 Partner API** – OAuth client credentials, scopes, idempotency, OpenAPI, webhooks with
      signing + retries, API docs page.
      _Done 2026-10-04. Each partner is its own tenant; clients are issued with `pnpm api:client`
      (operator script; the app role can't insert clients). Tokens are HS256 JWTs (key derived from
      `APP_SECRET`, 15 min) and every request re-checks that the client isn't revoked. The token
      endpoint finds a client before it knows the tenant through one extra RLS policy that exposes
      only the row whose `client_id` matches `app.client_id`. Partners act for the outing's
      organizer: events are recorded as the organizer's and audited as `client:<id>`. Partner-sent
      phone numbers match golfers across outings but stay unverified (no texts until the golfer
      confirms on the invite page). Invite links work across tenants (`/t/<token>` finds the
      owning tenant); account sessions only count in the consumer tenant. Additions to §4:
      `api_clients.last_used_at`, `idempotency_keys` stores `{status, body}` and is retried after
      a server error, `webhook_endpoints.description`, and `webhook_deliveries` has
      `event_type` (one claim can also emit `outing.full`), `last_status` and `delivered_at`.
      Webhook secrets are AES-256-GCM sealed; URLs must be public https (private/loopback hosts are
      refused when registering and again at send time; redirects aren't followed). Deliveries go
      out with the dispatcher (every 5 min, plus right after each change), backing off 1 min → 1 h
      for 24 h. `PATCH /tee-times/:id` changes capacity only (moving a start time isn't supported
      yet). `/outings/:id/seen`, `/verification/*` and `/crews` stay app-only in v1 (they're about a
      signed-in person, not a partner). Per-client limit: 300 requests/minute._
- [x] **M9 Hardening** – security headers/CSP, PII encryption, retention jobs, load test the claim
      endpoint, Playwright E2E for the full organizer → invitee flow, accessibility pass.
      _Done 2026-10-04. CSP: `src/proxy.ts` sends a per-request nonce (`script-src 'self'
      'nonce-…' 'strict-dynamic'`, no inline scripts; inline style attributes are still allowed);
      the root layout renders per request so the nonce applies. HSTS, nosniff, Referrer-Policy,
      frame-ancestors/X-Frame-Options and Permissions-Policy come from next.config. PII: phone
      columns (`players`, `users`, `verification_codes`, `crew_invites.invitee_phone`) are
      encrypted in the app with deterministic AES-256-GCM (key derived from `APP_SECRET`), so
      equality lookups and unique indexes still work; older plaintext rows still read and are
      sealed by the retention run. Rotating `APP_SECRET` now also makes stored phones unreadable.
      Retention runs with the scheduled dispatch: verification codes after 24 h, rate-limit
      windows after 2 days, ended sessions after 30 days, idempotency keys after 24 h, finished
      webhook deliveries after 30 days, sent notifications after 90 days, outings
      `tenants.retention_months` (default 18, added to §4) after their play date, and phone-only
      players nothing refers to any more. Self-serve account export (JSON) and deletion live at
      /settings/account (deleting removes upcoming outings they organize, frees their spots with a
      normal drop-out event, deletes crews they own, and leaves "Former member" on past sheets).
      Load test: `pnpm load:claim` (200 claims, 40 concurrent, at 6 spots, against a local
      production build on PGlite) gave exactly 6 winners and 194 clean `409 slot_taken`, p95
      ≈1 s (PGlite has one connection; Neon should be faster). E2E: `full-flow.spec.ts` (organizer
      → invitees → remove → lock → export → delete, no CSP violations) and `a11y.spec.ts` (axe
      WCAG 2.1 A/AA on every main screen); `pnpm test:e2e:prod` runs both against a production
      build._

## 11. Open decisions (ask Mike)

- National course data provider (licensing/cost).
- Hosting (suggest: Vercel or AWS for app, managed Postgres e.g. Neon/RDS) and domain.
- SMS provider account + 10DLC brand registration.
- Whether invitees may claim more than one tee time (currently: one personal slot per outing).
