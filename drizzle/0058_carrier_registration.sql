-- Carrier registration fields (Onboarding.md Step 4) + persisted approval reason.
-- Source: Onboarding.md Step 4 (US 10DLC / CA CWTA). Purely ADDITIVE — six nullable
-- text columns on organizations. Collected from the contractor in the onboarding
-- wizard (skippable, US/CA only) and copied by the PO for manual Twilio submission.
-- Address is reused from the existing address/city/state/zip columns.

-- PO-supplied reason when a carrier submission is rejected / needs resubmission.
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "sms_approval_reason" text;
--> statement-breakpoint

-- US legal business name / CA registered business name.
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "legal_business_name" text;
--> statement-breakpoint

-- US Employer Identification Number (10DLC).
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "ein" text;
--> statement-breakpoint

-- Canadian Business Number (CWTA).
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "business_number" text;
--> statement-breakpoint

-- US business website (10DLC).
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "website" text;
--> statement-breakpoint

-- Free-text description of how the org will use SMS (10DLC use case).
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "messaging_use_case" text;
