ALTER TABLE "api_clients" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "idempotency_keys" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "webhook_endpoints" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "webhook_deliveries" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
-- API clients are issued by operators (scripts/api-client.ts runs as the schema owner); the app
-- only reads them and stamps last_used_at.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ironed_app') THEN
    REVOKE INSERT, DELETE ON "api_clients" FROM ironed_app;
  END IF;
END
$$;
