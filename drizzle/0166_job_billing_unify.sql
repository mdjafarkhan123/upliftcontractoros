-- Unify the job billing model onto Jobber's billingType × billingFrequency (migration 0166).
-- Additive step: introduce `billing_frequency`, make `billing_type` NOT NULL, and backfill both
-- from the old split model (nullable billing_type + invoice_frequency + invoice_on_close +
-- fixed_invoice_amount). The retired columns are DROPPED in 0167 — after this backfill has read
-- them.

CREATE TYPE "public"."job_billing_frequency" AS ENUM('on_completion', 'per_visit', 'periodic', 'never');--> statement-breakpoint

-- New WHEN-to-invoice dial. Defaults every existing row to 'on_completion'; the backfill below
-- corrects the rows that were on another frequency.
ALTER TABLE "jobs" ADD COLUMN "billing_frequency" "job_billing_frequency" DEFAULT 'on_completion' NOT NULL;--> statement-breakpoint

-- Derive billing_frequency from the ORIGINAL state (billing_type is still nullable here, so a NULL
-- on a recurring job — "billing not configured" in the old model — maps to 'never'):
--   • recurring + no billing set up            → never
--   • per-visit cadence                        → per_visit
--   • weekly/biweekly/monthly cadence          → periodic (invoice_frequency keeps the cadence)
--   • visit-based with no explicit cadence     → per_visit
--   • everything else (incl. every one-off)    → on_completion
UPDATE "jobs" SET "billing_frequency" = (CASE
	WHEN "billing_type" IS NULL AND "job_type" = 'recurring' THEN 'never'
	WHEN "billing_type" IS NOT NULL AND "invoice_frequency" = 'per_visit' THEN 'per_visit'
	WHEN "billing_type" IS NOT NULL AND "invoice_frequency" IN ('weekly', 'biweekly', 'monthly') THEN 'periodic'
	WHEN "billing_type" = 'visit_based' THEN 'per_visit'
	ELSE 'on_completion'
END)::"job_billing_frequency";--> statement-breakpoint

-- 'per_visit' is now a billing_frequency, not a cadence — clear it from invoice_frequency (which
-- from now on only ever holds a periodic cadence).
UPDATE "jobs" SET "invoice_frequency" = NULL WHERE "invoice_frequency" = 'per_visit';--> statement-breakpoint

-- Fixed billing now means "the job's line items" (Jobber FIXED_PRICE), so a job that only carried a
-- flat `fixed_invoice_amount` and had no line items would bill nothing. Convert that flat amount into
-- a single (non-taxable, tax-inclusive) line item so those jobs keep billing the same total. Set the
-- job's own totals to match. Only touches fixed jobs with a positive amount and no existing lines.
UPDATE "jobs" SET "subtotal" = "fixed_invoice_amount", "tax_amount" = '0', "total" = "fixed_invoice_amount"
WHERE "billing_type" = 'fixed' AND "fixed_invoice_amount" IS NOT NULL AND "fixed_invoice_amount" > 0
	AND NOT EXISTS (
		SELECT 1 FROM "job_line_items" li WHERE li."job_id" = "jobs"."id" AND li."deleted_at" IS NULL
	);--> statement-breakpoint

INSERT INTO "job_line_items" ("org_id", "job_id", "description", "quantity", "unit_price", "taxable", "total", "position")
SELECT j."org_id", j."id", 'Recurring service', '1', j."fixed_invoice_amount", false, j."fixed_invoice_amount", 0
FROM "jobs" j
WHERE j."billing_type" = 'fixed' AND j."fixed_invoice_amount" IS NOT NULL AND j."fixed_invoice_amount" > 0
	AND NOT EXISTS (
		SELECT 1 FROM "job_line_items" li WHERE li."job_id" = j."id" AND li."deleted_at" IS NULL
	);--> statement-breakpoint

-- Now normalize the remaining NULL billing_type rows (one-off jobs never set it) to 'fixed' so the
-- column can become NOT NULL, then apply the default + NOT NULL constraint.
UPDATE "jobs" SET "billing_type" = 'fixed' WHERE "billing_type" IS NULL;--> statement-breakpoint
ALTER TABLE "jobs" ALTER COLUMN "billing_type" SET DEFAULT 'fixed';--> statement-breakpoint
ALTER TABLE "jobs" ALTER COLUMN "billing_type" SET NOT NULL;
