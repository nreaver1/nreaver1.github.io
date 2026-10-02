-- Row-Level Security baseline.
-- FORCE makes the policies apply to the table owner too (superusers still bypass, which is why
-- the app connects as the non-superuser role `ironed_app`). Every new tenant-owned table must get
-- `.enableRLS()` + the tenant policy in schema.ts and a FORCE line in a migration; the
-- "rls coverage" test fails if one is missed.
ALTER TABLE "users" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Privileges for the app role (created by docker/initdb locally, by infra elsewhere).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ironed_app') THEN
    GRANT USAGE ON SCHEMA public TO ironed_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ironed_app;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ironed_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ironed_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ironed_app;
    -- Tenants are managed by operators, not the app.
    REVOKE INSERT, UPDATE, DELETE ON "tenants" FROM ironed_app;
  END IF;
END
$$;
