CREATE TYPE "public"."member_notification_status" AS ENUM('in_office', 'on_job', 'deep_work', 'off_duty');--> statement-breakpoint
ALTER TABLE "member_notification_preferences" ADD COLUMN "email_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "member_notification_preferences" ADD COLUMN "sms_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "org_members" ADD COLUMN "notification_status" "member_notification_status" DEFAULT 'in_office' NOT NULL;--> statement-breakpoint
ALTER TABLE "org_members" ADD COLUMN "notification_status_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "org_members" ADD COLUMN "personal_quiet_hours_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "org_members" ADD COLUMN "personal_quiet_hours_start_hour" integer;--> statement-breakpoint
ALTER TABLE "org_members" ADD COLUMN "personal_quiet_hours_end_hour" integer;--> statement-breakpoint
ALTER TABLE "org_members" ADD COLUMN "escalation_minutes" integer DEFAULT 5 NOT NULL;