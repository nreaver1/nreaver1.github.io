CREATE TYPE "public"."crew_invite_kind" AS ENUM('link', 'personal');--> statement-breakpoint
CREATE TYPE "public"."crew_invite_status" AS ENUM('open', 'accepted', 'declined', 'canceled');--> statement-breakpoint
ALTER TABLE "crew_invites" ADD COLUMN "kind" "crew_invite_kind" DEFAULT 'link' NOT NULL;--> statement-breakpoint
ALTER TABLE "crew_invites" ADD COLUMN "invitee_name" text;--> statement-breakpoint
ALTER TABLE "crew_invites" ADD COLUMN "invitee_email" "citext";--> statement-breakpoint
ALTER TABLE "crew_invites" ADD COLUMN "invitee_phone" text;--> statement-breakpoint
ALTER TABLE "crew_invites" ADD COLUMN "status" "crew_invite_status" DEFAULT 'open' NOT NULL;--> statement-breakpoint
ALTER TABLE "crew_invites" ADD COLUMN "accepted_by" uuid;--> statement-breakpoint
ALTER TABLE "crew_invites" ADD CONSTRAINT "crew_invites_accepted_by_users_id_fk" FOREIGN KEY ("accepted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "crew_invites_email_idx" ON "crew_invites" USING btree ("invitee_email") WHERE "crew_invites"."status" = 'open';--> statement-breakpoint
CREATE INDEX "crew_invites_phone_idx" ON "crew_invites" USING btree ("invitee_phone") WHERE "crew_invites"."status" = 'open';--> statement-breakpoint
ALTER TABLE "crew_invites" ADD CONSTRAINT "crew_invites_personal_shape" CHECK ("crew_invites"."kind" = 'link' or ("crew_invites"."invitee_name" is not null and ("crew_invites"."invitee_email" is not null or "crew_invites"."invitee_phone" is not null)));