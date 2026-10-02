ALTER TABLE "players" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "audit_log" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
-- The audit log is append-only for the app.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ironed_app') THEN
    REVOKE UPDATE, DELETE ON "audit_log" FROM ironed_app;
  END IF;
END
$$;
