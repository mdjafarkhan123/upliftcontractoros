-- Contact P1 gaps: lead source channels + Do Not Contact flag.
--
-- 1. Extend lead_source_type enum with 8 new marketing channels that
--    contractors actually use for ROI tracking.
-- 2. Add do_not_contact + do_not_contact_at columns — hard "block all outreach"
--    flag distinct from SMS opt-out. Set manually by staff only.

ALTER TYPE "lead_source_type" ADD VALUE IF NOT EXISTS 'google_ads';--> statement-breakpoint
ALTER TYPE "lead_source_type" ADD VALUE IF NOT EXISTS 'yelp';--> statement-breakpoint
ALTER TYPE "lead_source_type" ADD VALUE IF NOT EXISTS 'angi';--> statement-breakpoint
ALTER TYPE "lead_source_type" ADD VALUE IF NOT EXISTS 'facebook';--> statement-breakpoint
ALTER TYPE "lead_source_type" ADD VALUE IF NOT EXISTS 'nextdoor';--> statement-breakpoint
ALTER TYPE "lead_source_type" ADD VALUE IF NOT EXISTS 'door_hanger';--> statement-breakpoint
ALTER TYPE "lead_source_type" ADD VALUE IF NOT EXISTS 'job_sign';--> statement-breakpoint
ALTER TYPE "lead_source_type" ADD VALUE IF NOT EXISTS 'repeat_customer';--> statement-breakpoint

ALTER TABLE "contacts"
  ADD COLUMN IF NOT EXISTS "do_not_contact" boolean NOT NULL DEFAULT false;--> statement-breakpoint

ALTER TABLE "contacts"
  ADD COLUMN IF NOT EXISTS "do_not_contact_at" timestamp with time zone;
