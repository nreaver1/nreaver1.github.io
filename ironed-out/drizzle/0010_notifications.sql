CREATE TYPE "public"."alert_type" AS ENUM('join', 'drop', 'change', 'remind_day', 'remind_2h');--> statement-breakpoint
CREATE TYPE "public"."notification_channel" AS ENUM('sms', 'email');--> statement-breakpoint
CREATE TYPE "public"."notification_kind" AS ENUM('change', 'removed', 'remind_day', 'remind_2h');--> statement-breakpoint
CREATE TYPE "public"."notification_status" AS ENUM('pending', 'sent', 'skipped', 'failed');--> statement-breakpoint
CREATE TABLE "notification_prefs" (
	"player_id" uuid NOT NULL,
	"event_type" "alert_type" NOT NULL,
	"sms" boolean NOT NULL,
	"email" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_prefs_player_id_event_type_pk" PRIMARY KEY("player_id","event_type")
);
--> statement-breakpoint
ALTER TABLE "notification_prefs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "notification_settings" (
	"player_id" uuid PRIMARY KEY NOT NULL,
	"quiet_start" time,
	"quiet_end" time,
	"timezone" text,
	"sms_opted_out_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notification_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"outing_id" uuid,
	"channel" "notification_channel" NOT NULL,
	"kind" "notification_kind" NOT NULL,
	"key" text,
	"event_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"send_after" timestamp with time zone NOT NULL,
	"status" "notification_status" DEFAULT 'pending' NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"last_error" text,
	"body" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "notification_prefs" ADD CONSTRAINT "notification_prefs_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_settings" ADD CONSTRAINT "notification_settings_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_outing_id_outings_id_fk" FOREIGN KEY ("outing_id") REFERENCES "public"."outings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_pending_key" ON "notifications" USING btree ("key") WHERE "notifications"."status" = 'pending' and "notifications"."key" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_reminder_once" ON "notifications" USING btree ("key") WHERE "notifications"."kind" in ('remind_day', 'remind_2h');--> statement-breakpoint
CREATE INDEX "notifications_due_idx" ON "notifications" USING btree ("status","send_after");--> statement-breakpoint
CREATE INDEX "notifications_player_idx" ON "notifications" USING btree ("player_id","created_at");--> statement-breakpoint
CREATE POLICY "notification_prefs_via_player" ON "notification_prefs" AS PERMISSIVE FOR ALL TO public USING (player_id in (select id from players)) WITH CHECK (player_id in (select id from players));--> statement-breakpoint
CREATE POLICY "notification_settings_via_player" ON "notification_settings" AS PERMISSIVE FOR ALL TO public USING (player_id in (select id from players)) WITH CHECK (player_id in (select id from players));--> statement-breakpoint
CREATE POLICY "notifications_tenant_isolation" ON "notifications" AS PERMISSIVE FOR ALL TO public USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);