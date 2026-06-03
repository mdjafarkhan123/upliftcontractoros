-- Low-credit warning guard. Set when an org's balance first drops below 20% of
-- its monthly_included_credit so the contractor warning fires once per cycle.
-- Cleared on monthly grant and manual top-up so a replenished org can be warned
-- again. Nullable timestamptz; existing rows default to NULL (not yet warned).
ALTER TABLE "org_sms_credit"
	ADD COLUMN IF NOT EXISTS "low_credit_notified_at" timestamp with time zone;
