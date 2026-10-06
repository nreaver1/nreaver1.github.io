# Ironed Out

Organize golf outings: book the tee times, share one link, friends claim spots.
Scope, data model and milestones: [`docs/SPEC.md`](docs/SPEC.md). Working rules: [`CLAUDE.md`](CLAUDE.md).

## Setup

Requires Node 22+, pnpm, and Docker (for the local database).

```sh
pnpm install
cp .env.example .env
pnpm db:up        # Postgres 17 + PostGIS in Docker; also creates the `ironed_app` role
pnpm db:migrate
pnpm db:seed
pnpm dev          # http://localhost:3000  (component gallery at /styleguide in dev)
```

## Commands

| Command                           | What it does                                          |
| --------------------------------- | ----------------------------------------------------- |
| `pnpm dev`                        | Run the app                                           |
| `pnpm db:generate`                | Create a migration from changes to `src/server/db/schema.ts` |
| `pnpm db:migrate` / `pnpm db:seed` | Apply migrations / seed data (idempotent)             |
| `pnpm test`                       | Vitest: components (jsdom) and database tests (in-memory PGlite, no Docker needed) |
| `pnpm test:e2e`                   | Playwright at 360px wide                              |
| `pnpm lint` / `pnpm typecheck` / `pnpm format` | Lint, type-check, format                  |
| `pnpm api:client create\|list\|revoke` | Issue/revoke partner API clients (runs as the schema owner) |
| `pnpm test:e2e:prod`              | Full-flow + accessibility specs on a production build (checks the CSP) |
| `pnpm load:claim --url … --client-id … --client-secret …` | Concurrent-claim load test with invariant checks |

## Layout

```
src/app/              Next.js routes (pages + /api/v1 handlers — thin, no domain logic)
src/components/ui/    Base components: Button, Card, Input, Pill/PillGroup, Stepper, Sheet
src/styles/tokens.css Design tokens (SPEC §9) — the only place colors are defined
src/server/domain/    Domain logic (framework-free)
src/server/db/        Drizzle schema, client, withTenant(), seed
src/server/notify/    SMS/email provider interfaces
drizzle/              SQL migrations (generated + hand-written RLS/extension migrations)
tests/                Test helpers, Playwright specs
```

## Multi-tenancy and Row-Level Security

Every tenant-owned table has a `tenant_id` column, RLS enabled **and forced**, and the policy
`tenant_id = current_setting('app.tenant_id')`. Run tenant queries through
`withTenant(db, tenantId, tx => …)`, which sets the tenant for that transaction only.

- The app connects as `ironed_app` (not a superuser — superusers bypass RLS). Migrations and
  seeds run as the owner via `MIGRATION_DATABASE_URL`.
- No tenant set → no rows. Writing a row for another tenant fails.
- Adding a tenant-owned table: add `tenantIsolation('<table>')` + `.enableRLS()` in `schema.ts`,
  then `ALTER TABLE … FORCE ROW LEVEL SECURITY` in a migration. The "rls coverage" test fails if
  you forget.

## Partner API

`/api/v1` (SPEC §7). Guide at `/developers`, OpenAPI 3.1 at `/api/v1/openapi.json` (generated from
the Zod schemas). Each partner is its own tenant; issue a client with

```sh
pnpm api:client create --tenant acme-golf --tenant-name "Acme Golf" --name "Acme prod" \
  --scopes outings:read,outings:write,players:read,webhooks:manage
```

which prints the `client_secret` once. Against production, run it with
`MIGRATION_DATABASE_URL` set to Neon's owner URL. Webhooks go out with the dispatcher run.

Booking sites can embed an "Invite your group" button instead of creating outings up front:
`POST /api/v1/widget-tokens` → link to `/w/<token>` + `/widget/v1.js`. Live demo on a made-up
booking site: `/developers/widget` (its tenant is created by `pnpm db:seed`).

## Deployment

Live at **https://ironed-out-alpha.vercel.app** (sample invite: `/demo`).

- Vercel project `ironed-out`, git-connected to `nreaver1/nreaver1.github.io` with Root Directory
  `ironed-out`. Pushes to `master` that touch this folder deploy to production.
- Database: Neon Postgres (Vercel marketplace, `iad1`). The integration sets `DATABASE_URL` /
  `DATABASE_URL_UNPOOLED` (owner). Production builds run `scripts/migrate.ts` and
  `scripts/seed.ts` first; migrate creates/updates the `ironed_app` login role from
  `APP_DB_PASSWORD`, and the app connects as that role so Row-Level Security applies.
- Production env: `APP_SECRET`, `APP_DB_PASSWORD`, `APP_URL`, `CRON_SECRET`. Optional:
  `RESEND_API_KEY` + `EMAIL_FROM` (email), `CONTACT_EMAIL` (shown on /privacy), `TWILIO_*` (real SMS; without them the app runs in
  SMS demo mode). With Twilio, point the Messaging Service's inbound webhook at
  `/api/webhooks/twilio/sms`.
- Texts/emails: `/api/internal/dispatch` sends what's due. The repo-root workflow
  `ironed-out-dispatch.yml` calls it every 5 minutes with the `IRONED_OUT_CRON_SECRET` repo
  secret (same value as `CRON_SECRET`); Vercel Cron calls it daily as a backstop.
- Preview deployments build but aren't configured to run (no secrets on Preview).
