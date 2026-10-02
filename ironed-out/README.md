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
