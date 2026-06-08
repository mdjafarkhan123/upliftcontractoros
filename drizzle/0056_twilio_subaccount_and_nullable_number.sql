-- Provisioning foundation (Step 5.1).
-- Source: Onboarding.md Step 3 + sms-onboarding-plan. Two changes, both non-destructive:
--   1. twilio_phone_number becomes nullable so an org can onboard without a number
--      ("skip number / SMS optional"). Existing rows keep their values.
--   2. Add per-contractor Twilio subaccount columns (SID + auth token), both nullable.
--      Populated by provisioning in Step 5.2. Null = no number yet / legacy master-owned.
-- No behavior change: the send path and PDF sender display already guard a missing number.

ALTER TABLE "organizations" ALTER COLUMN "twilio_phone_number" DROP NOT NULL;
--> statement-breakpoint

ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "twilio_subaccount_sid" text;
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "twilio_subaccount_auth_token" text;
