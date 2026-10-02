ALTER TABLE "outings" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "tee_times" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "slots" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "outing_events" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "outing_views" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ironed_app') THEN
    -- The course catalog is maintained by seeds/providers, not the app.
    REVOKE INSERT, UPDATE, DELETE ON "courses" FROM ironed_app;
    -- The change log is append-only.
    REVOKE UPDATE, DELETE ON "outing_events" FROM ironed_app;
  END IF;
END
$$;
