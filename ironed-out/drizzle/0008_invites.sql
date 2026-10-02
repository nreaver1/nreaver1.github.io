CREATE TYPE "public"."verification_purpose" AS ENUM('claim', 'phone');--> statement-breakpoint
CREATE TABLE "invite_links" (
	"id" uuid PRIMARY KEY NOT NULL,
	"outing_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invite_links_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "invite_links" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "verification_codes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"phone_e164" text NOT NULL,
	"code_hash" text NOT NULL,
	"purpose" "verification_purpose" NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invite_links" ADD CONSTRAINT "invite_links_outing_id_outings_id_fk" FOREIGN KEY ("outing_id") REFERENCES "public"."outings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite_links" ADD CONSTRAINT "invite_links_created_by_players_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invite_links_outing_idx" ON "invite_links" USING btree ("outing_id");--> statement-breakpoint
CREATE INDEX "verification_codes_phone_idx" ON "verification_codes" USING btree ("phone_e164","created_at");--> statement-breakpoint
CREATE POLICY "invite_links_via_outing" ON "invite_links" AS PERMISSIVE FOR ALL TO public USING (outing_id in (select id from outings)) WITH CHECK (outing_id in (select id from outings));