-- Speed-to-Lead channel pick (Notification system Stage 2.a).
-- Admin chooses how a new lead is auto-acknowledged (smart / sms / email / both)
-- plus an email subject + body for the email paths. Send logic lands in Stage 2.b.

-- drizzle-kit omits CREATE TYPE for new pgEnums — add it manually (see migration 0084).
CREATE TYPE "public"."speed_to_lead_channel" AS ENUM('smart', 'sms', 'email', 'both');
--> statement-breakpoint

ALTER TABLE "automation_settings"
  ADD COLUMN "speed_to_lead_channel" "speed_to_lead_channel" DEFAULT 'smart' NOT NULL;
--> statement-breakpoint

ALTER TABLE "automation_settings"
  ADD COLUMN "speed_to_lead_email_subject" text;
--> statement-breakpoint

ALTER TABLE "automation_settings"
  ADD COLUMN "speed_to_lead_email_message" text;
--> statement-breakpoint

-- Backfill existing orgs with sensible defaults so we can flip to NOT NULL.
UPDATE "automation_settings"
SET "speed_to_lead_email_subject" =
  'Thanks for reaching out to {org_name}'
WHERE "speed_to_lead_email_subject" IS NULL;
--> statement-breakpoint

UPDATE "automation_settings"
SET "speed_to_lead_email_message" =
  E'Hi {contact_name},\n\nThanks for reaching out to {org_name} — we''ve got your message and someone from our team will be in touch shortly.\n\nIf it''s urgent, just reply to this email and we''ll get right back to you.\n\nThanks,\n{org_name}'
WHERE "speed_to_lead_email_message" IS NULL;
--> statement-breakpoint

ALTER TABLE "automation_settings"
  ALTER COLUMN "speed_to_lead_email_subject" SET NOT NULL;
--> statement-breakpoint

ALTER TABLE "automation_settings"
  ALTER COLUMN "speed_to_lead_email_message" SET NOT NULL;
