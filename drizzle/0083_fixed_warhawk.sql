ALTER TABLE "org_members" ADD COLUMN "notification_phone" text;--> statement-breakpoint
ALTER TABLE "org_members" ADD COLUMN "sms_notifications_allowed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "org_members" ADD COLUMN "email_notifications_allowed" boolean DEFAULT true NOT NULL;