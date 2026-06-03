-- Appointment booking confirmation (instant SMS + email + .ics attachment)
-- Fires only when booking_source = 'booking_link' (i.e. customer self-booked).

ALTER TYPE "automation_job_type" ADD VALUE IF NOT EXISTS 'appointment_confirmation';
--> statement-breakpoint

ALTER TABLE "automation_settings"
  ADD COLUMN "appointment_confirmation_enabled" boolean NOT NULL DEFAULT true;
--> statement-breakpoint

ALTER TABLE "automation_settings"
  ADD COLUMN "appointment_confirmation_sms_message" text;
--> statement-breakpoint

ALTER TABLE "automation_settings"
  ADD COLUMN "appointment_confirmation_email_subject" text;
--> statement-breakpoint

ALTER TABLE "automation_settings"
  ADD COLUMN "appointment_confirmation_email_message" text;
--> statement-breakpoint

-- Backfill existing orgs with sensible defaults so we can flip to NOT NULL.
UPDATE "automation_settings"
SET "appointment_confirmation_sms_message" =
  'Hi {contact_name}, your {appointment_type} with {org_name} is confirmed for {appointment_datetime}. We''ll text a reminder before. Reply to this message anytime.'
WHERE "appointment_confirmation_sms_message" IS NULL;
--> statement-breakpoint

UPDATE "automation_settings"
SET "appointment_confirmation_email_subject" =
  'Your appointment with {org_name} is confirmed'
WHERE "appointment_confirmation_email_subject" IS NULL;
--> statement-breakpoint

UPDATE "automation_settings"
SET "appointment_confirmation_email_message" =
  E'Hi {contact_name},\n\nYour {appointment_type} with {org_name} is confirmed for {appointment_datetime}.\n\n{location_block}We''ve attached a calendar invite so you can add it to Google, Outlook, or Apple Calendar in one tap.\n\nIf anything comes up, just reply to this email and we''ll sort it out.\n\nThanks,\n{org_name}'
WHERE "appointment_confirmation_email_message" IS NULL;
--> statement-breakpoint

ALTER TABLE "automation_settings"
  ALTER COLUMN "appointment_confirmation_sms_message" SET NOT NULL;
--> statement-breakpoint

ALTER TABLE "automation_settings"
  ALTER COLUMN "appointment_confirmation_email_subject" SET NOT NULL;
--> statement-breakpoint

ALTER TABLE "automation_settings"
  ALTER COLUMN "appointment_confirmation_email_message" SET NOT NULL;
