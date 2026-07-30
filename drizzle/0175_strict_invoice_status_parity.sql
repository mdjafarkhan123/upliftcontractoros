-- Strict Jobber invoice status parity (B4.4).
-- Recreate invoice_status with Jobber's exact enum set + remap every existing row. Postgres cannot
-- drop enum values in place, so: widen the column to text, drop the old type, create the new type,
-- remap the text values, then narrow back to the new enum. The retired 'cancelled' status is folded
-- into a soft-delete (Jobber has no cancel — the cancel action becomes a delete).

--> add the close-tracking columns first (independent of the enum work)
ALTER TABLE "invoices" ADD COLUMN "received_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "bad_debt_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "written_off_amount" numeric(12, 2);--> statement-breakpoint

--> The partial unique index "one active invoice per quote" is bound to the invoice_status type via
--> its `status <> 'cancelled'` predicate, which blocks DROP TYPE. Drop it now and recreate it below
--> without the cancelled clause: cancelled is retired and cancel->delete means `deleted_at IS NULL`
--> already excludes those rows (identical invariant).
DROP INDEX IF EXISTS "idx_invoices_quote_conversion";--> statement-breakpoint

--> widen the column so the old enum labels survive as free text during the remap
ALTER TABLE "invoices" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "invoices" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."invoice_status";--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('draft', 'sent_not_due', 'awaiting_payment', 'paid', 'past_due', 'bad_debt');--> statement-breakpoint

--> Jobber has no 'cancelled' invoice status: soft-delete existing cancelled rows (they leave the
--> lists, matching the cancel->delete conversion) before their status value is remapped away.
UPDATE "invoices" SET "deleted_at" = now(), "updated_at" = now()
	WHERE "status" = 'cancelled' AND "deleted_at" IS NULL;--> statement-breakpoint

--> remap every old status value to the new Jobber set:
--> sent           -> sent_not_due (future due date) else awaiting_payment
--> partially_paid -> past_due (already past due) else awaiting_payment (Jobber has no partial status)
--> overdue        -> past_due
--> cancelled      -> draft (rows already soft-deleted above; the value is cosmetic)
UPDATE "invoices" SET "status" = CASE "status"
	WHEN 'draft' THEN 'draft'
	WHEN 'sent' THEN (CASE WHEN "due_date" IS NOT NULL AND "due_date" > CURRENT_DATE THEN 'sent_not_due' ELSE 'awaiting_payment' END)
	WHEN 'partially_paid' THEN (CASE WHEN "due_date" IS NOT NULL AND "due_date" < CURRENT_DATE THEN 'past_due' ELSE 'awaiting_payment' END)
	WHEN 'overdue' THEN 'past_due'
	WHEN 'paid' THEN 'paid'
	WHEN 'cancelled' THEN 'draft'
	ELSE 'awaiting_payment'
END;--> statement-breakpoint

--> narrow back to the new enum + restore the default
ALTER TABLE "invoices" ALTER COLUMN "status" SET DATA TYPE "public"."invoice_status" USING "status"::"public"."invoice_status";--> statement-breakpoint
ALTER TABLE "invoices" ALTER COLUMN "status" SET DEFAULT 'draft';--> statement-breakpoint

--> recreate the "one active invoice per quote" partial unique index (cancelled clause removed —
--> cancel is now a soft-delete, so deleted_at IS NULL carries the same exclusion).
CREATE UNIQUE INDEX "idx_invoices_quote_conversion" ON "invoices" USING btree ("quote_id")
	WHERE "quote_id" IS NOT NULL AND "deleted_at" IS NULL;
