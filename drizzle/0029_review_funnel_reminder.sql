-- Review funnel reminder (T+72h nudge for unanswered review requests)

ALTER TABLE "automation_settings"
  ADD COLUMN "review_funnel_reminder_enabled" boolean NOT NULL DEFAULT true;
--> statement-breakpoint

ALTER TABLE "automation_settings"
  ADD COLUMN "review_funnel_reminder_message" text;
--> statement-breakpoint

-- Backfill existing orgs with a sensible default so we can flip to NOT NULL.
UPDATE "automation_settings"
SET "review_funnel_reminder_message" =
  'Hi {contact_name}, quick nudge from {org_name} — we''d love your rating: {review_link}'
WHERE "review_funnel_reminder_message" IS NULL;
--> statement-breakpoint

ALTER TABLE "automation_settings"
  ALTER COLUMN "review_funnel_reminder_message" SET NOT NULL;
--> statement-breakpoint

ALTER TABLE "review_requests"
  ADD COLUMN "reminder_sent_at" timestamp with time zone;
--> statement-breakpoint

ALTER TABLE "review_requests"
  ADD COLUMN "reminder_bull_job_id" text;
