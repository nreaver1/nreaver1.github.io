# Ironed Out

A web app for organizing golf outings. An organizer books tee times (often 2–3 consecutive
tee times = 8–12 spots), shares ONE link in a group chat, and friends claim spots from that link.
Later this becomes a B2B service that tee-time booking platforms (GolfNow, Chronogolf, etc.)
integrate via API, so build API-first with enterprise-grade security from day one.

**Read `docs/SPEC.md` before writing code.** It is the source of truth for scope, data model,
API, security and milestones. Visual reference lives in `design/` (see `design/README.md`).

## Stack

- TypeScript everywhere, strict mode, no `any`.
- Next.js (App Router) for the web app; public REST API under `/api/v1` in the same app for now,
  structured so it can be split into its own service later (keep domain logic in `src/server/domain`,
  never in route handlers or React components).
- PostgreSQL + Drizzle ORM + drizzle-kit migrations.
- Zod for every input boundary; generate the OpenAPI spec from the Zod schemas.
- Background jobs (texts, emails, webhooks): pg-boss on the same Postgres.
- SMS + phone verification codes: Twilio Messaging for alerts and for the codes we generate
  ourselves (not Twilio Verify, to keep per-code cost down), behind an interface in
  `src/server/notify` so the provider is swappable. Keep SMS copy GSM-7 (no curly quotes or `·`).
- Tests: Vitest for unit/domain, Playwright for the claim flow end to end.
- Package manager: pnpm.

## Rules

- Mobile-first. The invite page is opened from a text message on a phone; it must be fast and work
  at 360px wide.
- Every state change to an outing writes a row to `outing_events` in the same transaction. That
  table drives the "Since you last looked" banner, SMS alerts and partner webhooks.
- Claiming a spot must be race-safe (row lock + unique constraints). Never trust the client about
  which spots are open.
- Secrets only from env vars; never log tokens, codes, passwords, or full phone numbers.
- Invite and crew links: random 128-bit tokens, store only a SHA-256 hash, support expiry and revoke.
- Accessibility: real buttons/links/labels, 44px touch targets, 4.5:1 text contrast.
- Keep the hand-drawn look consistent: use the tokens in `docs/SPEC.md` §9, don't invent new colors.

## Working style

- Build milestone by milestone (SPEC §10). Finish one, with tests passing, before starting the next.
- After each milestone, update the checklist in SPEC §10 and summarize what changed.
- Ask before adding a new paid third-party service or changing the data model in ways the spec
  doesn't cover.

## Commands (create these in milestone 1)

- `pnpm dev` – run the app
- `pnpm db:migrate` / `pnpm db:seed` – migrations and seed data (incl. Baltimore-area courses)
- `pnpm test` / `pnpm test:e2e`
- `pnpm lint` / `pnpm typecheck`
- `pnpm api:client create|list|revoke` – partner API clients

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
