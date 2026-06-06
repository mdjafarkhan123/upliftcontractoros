-- Relocate per-org SMS send-rate limits from org_sms_credit → organizations so
-- they live in the org entitlement-limits system (edited in /jafar → Entitlements
-- → Usage limits, beside Monthly SMS / Bulk SMS per day). 0 = unlimited.
-- Supersedes 0052, which placed them on org_sms_credit.

ALTER TABLE "organizations"
	ADD COLUMN IF NOT EXISTS "max_sms_per_minute" integer DEFAULT 30 NOT NULL;--> statement-breakpoint

ALTER TABLE "organizations"
	ADD COLUMN IF NOT EXISTS "max_sms_per_day" integer DEFAULT 1000 NOT NULL;--> statement-breakpoint

ALTER TABLE "org_sms_credit" DROP COLUMN IF EXISTS "sms_rate_per_min";--> statement-breakpoint

ALTER TABLE "org_sms_credit" DROP COLUMN IF EXISTS "sms_rate_per_day";
