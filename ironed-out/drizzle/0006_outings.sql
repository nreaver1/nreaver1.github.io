CREATE TYPE "public"."course_source" AS ENUM('seed', 'provider', 'manual');--> statement-breakpoint
CREATE TYPE "public"."outing_event_type" AS ENUM('outing_created', 'slot_claimed', 'slot_released', 'player_removed', 'guest_added', 'tee_time_added', 'tee_time_removed', 'capacity_changed', 'outing_updated', 'locked', 'unlocked');--> statement-breakpoint
CREATE TABLE "courses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"city" text NOT NULL,
	"region" text NOT NULL,
	"country" text DEFAULT 'US' NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"timezone" text NOT NULL,
	"is_public" boolean DEFAULT true NOT NULL,
	"source" "course_source" DEFAULT 'seed' NOT NULL,
	"external_ids" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"geog" geography(Point,4326) GENERATED ALWAYS AS ((st_setsrid(st_makepoint(lng, lat), 4326))::geography) STORED,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outing_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"outing_id" uuid NOT NULL,
	"type" "outing_event_type" NOT NULL,
	"actor_player_id" uuid,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "outing_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "outing_views" (
	"outing_id" uuid NOT NULL,
	"viewer_key" text NOT NULL,
	"last_seen_event_id" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outing_views_outing_id_viewer_key_pk" PRIMARY KEY("outing_id","viewer_key")
);
--> statement-breakpoint
ALTER TABLE "outing_views" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "outings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"organizer_player_id" uuid NOT NULL,
	"crew_id" uuid,
	"course_id" uuid NOT NULL,
	"play_date" date NOT NULL,
	"timezone" text NOT NULL,
	"price_cents" integer,
	"currency" text DEFAULT 'USD' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"locked_at" timestamp with time zone,
	"external_ref" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outings_price_nonnegative" CHECK ("outings"."price_cents" is null or "outings"."price_cents" >= 0)
);
--> statement-breakpoint
ALTER TABLE "outings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "slots" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tee_time_id" uuid NOT NULL,
	"outing_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"player_id" uuid,
	"guest_of_player_id" uuid,
	"claimed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "slots_guest_shape" CHECK ("slots"."guest_of_player_id" is null or "slots"."player_id" is null)
);
--> statement-breakpoint
ALTER TABLE "slots" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "tee_times" (
	"id" uuid PRIMARY KEY NOT NULL,
	"outing_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"capacity" smallint DEFAULT 4 NOT NULL,
	"sort" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tee_times_capacity_range" CHECK ("tee_times"."capacity" between 2 and 5)
);
--> statement-breakpoint
ALTER TABLE "tee_times" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "outing_events" ADD CONSTRAINT "outing_events_outing_id_outings_id_fk" FOREIGN KEY ("outing_id") REFERENCES "public"."outings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outing_events" ADD CONSTRAINT "outing_events_actor_player_id_players_id_fk" FOREIGN KEY ("actor_player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outing_views" ADD CONSTRAINT "outing_views_outing_id_outings_id_fk" FOREIGN KEY ("outing_id") REFERENCES "public"."outings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outings" ADD CONSTRAINT "outings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outings" ADD CONSTRAINT "outings_organizer_player_id_players_id_fk" FOREIGN KEY ("organizer_player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outings" ADD CONSTRAINT "outings_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slots" ADD CONSTRAINT "slots_tee_time_id_tee_times_id_fk" FOREIGN KEY ("tee_time_id") REFERENCES "public"."tee_times"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slots" ADD CONSTRAINT "slots_outing_id_outings_id_fk" FOREIGN KEY ("outing_id") REFERENCES "public"."outings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slots" ADD CONSTRAINT "slots_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slots" ADD CONSTRAINT "slots_guest_of_player_id_players_id_fk" FOREIGN KEY ("guest_of_player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tee_times" ADD CONSTRAINT "tee_times_outing_id_outings_id_fk" FOREIGN KEY ("outing_id") REFERENCES "public"."outings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "courses_name_city_key" ON "courses" USING btree ("name","city","region");--> statement-breakpoint
CREATE INDEX "courses_name_trgm_idx" ON "courses" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "courses_city_trgm_idx" ON "courses" USING gin ("city" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "courses_geog_idx" ON "courses" USING gist ("geog");--> statement-breakpoint
CREATE INDEX "outing_events_outing_idx" ON "outing_events" USING btree ("outing_id","id");--> statement-breakpoint
CREATE INDEX "outings_organizer_idx" ON "outings" USING btree ("organizer_player_id");--> statement-breakpoint
CREATE INDEX "outings_play_date_idx" ON "outings" USING btree ("tenant_id","play_date");--> statement-breakpoint
CREATE UNIQUE INDEX "slots_tee_time_position_key" ON "slots" USING btree ("tee_time_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "slots_one_personal_slot_per_outing" ON "slots" USING btree ("outing_id","player_id") WHERE "slots"."player_id" is not null and "slots"."guest_of_player_id" is null;--> statement-breakpoint
CREATE INDEX "slots_outing_idx" ON "slots" USING btree ("outing_id");--> statement-breakpoint
CREATE INDEX "tee_times_outing_idx" ON "tee_times" USING btree ("outing_id","sort");--> statement-breakpoint
CREATE POLICY "outing_events_via_outing" ON "outing_events" AS PERMISSIVE FOR ALL TO public USING (outing_id in (select id from outings)) WITH CHECK (outing_id in (select id from outings));--> statement-breakpoint
CREATE POLICY "outing_views_via_outing" ON "outing_views" AS PERMISSIVE FOR ALL TO public USING (outing_id in (select id from outings)) WITH CHECK (outing_id in (select id from outings));--> statement-breakpoint
CREATE POLICY "outings_tenant_isolation" ON "outings" AS PERMISSIVE FOR ALL TO public USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "slots_via_outing" ON "slots" AS PERMISSIVE FOR ALL TO public USING (outing_id in (select id from outings)) WITH CHECK (outing_id in (select id from outings));--> statement-breakpoint
CREATE POLICY "tee_times_via_outing" ON "tee_times" AS PERMISSIVE FOR ALL TO public USING (outing_id in (select id from outings)) WITH CHECK (outing_id in (select id from outings));