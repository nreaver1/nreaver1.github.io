CREATE TYPE "public"."crew_member_status" AS ENUM('active', 'pending');--> statement-breakpoint
CREATE TYPE "public"."crew_role" AS ENUM('owner', 'member');--> statement-breakpoint
ALTER TYPE "public"."notification_kind" ADD VALUE 'new_outing';--> statement-breakpoint
CREATE TABLE "crew_invites" (
	"id" uuid PRIMARY KEY NOT NULL,
	"crew_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crew_invites_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "crew_invites" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "crew_members" (
	"crew_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "crew_role" DEFAULT 'member' NOT NULL,
	"status" "crew_member_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crew_members_crew_id_user_id_pk" PRIMARY KEY("crew_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "crew_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "crews" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "crews" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "crew_invites" ADD CONSTRAINT "crew_invites_crew_id_crews_id_fk" FOREIGN KEY ("crew_id") REFERENCES "public"."crews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crew_invites" ADD CONSTRAINT "crew_invites_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crew_members" ADD CONSTRAINT "crew_members_crew_id_crews_id_fk" FOREIGN KEY ("crew_id") REFERENCES "public"."crews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crew_members" ADD CONSTRAINT "crew_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crews" ADD CONSTRAINT "crews_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crews" ADD CONSTRAINT "crews_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "crew_invites_crew_idx" ON "crew_invites" USING btree ("crew_id");--> statement-breakpoint
CREATE INDEX "crew_members_user_idx" ON "crew_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "crews_owner_idx" ON "crews" USING btree ("owner_user_id");--> statement-breakpoint
ALTER TABLE "outings" ADD CONSTRAINT "outings_crew_id_crews_id_fk" FOREIGN KEY ("crew_id") REFERENCES "public"."crews"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "crew_invites_via_crew" ON "crew_invites" AS PERMISSIVE FOR ALL TO public USING (crew_id in (select id from crews)) WITH CHECK (crew_id in (select id from crews));--> statement-breakpoint
CREATE POLICY "crew_members_via_crew" ON "crew_members" AS PERMISSIVE FOR ALL TO public USING (crew_id in (select id from crews)) WITH CHECK (crew_id in (select id from crews));--> statement-breakpoint
CREATE POLICY "crews_tenant_isolation" ON "crews" AS PERMISSIVE FOR ALL TO public USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);