-- Data backfill (no schema change): heal visits that were rolled into an invoice
-- (billed_invoice_id set) before generate-invoice learned to complete them. Such a visit kept
-- status='scheduled', and because the job's schedule badge reads the earliest still-OPEN dated
-- visit (MIN(scheduled_start) FILTER status='scheduled'), a past billed visit pinned its job on
-- "Late" forever. Going forward the endpoint marks billed visits complete; this cleans the rows
-- created before that fix.
--
-- completed_at falls back to updated_at (best-known "when it was billed"); completed_by is left
-- NULL (the original actor is unknown). No outbox events are emitted for these historical rows —
-- there is nothing to notify retroactively.
UPDATE "appointments"
SET "status" = 'completed',
    "completed_at" = COALESCE("completed_at", "updated_at"),
    "updated_at" = now()
WHERE "billed_invoice_id" IS NOT NULL
  AND "status" IN ('scheduled', 'unscheduled')
  AND "deleted_at" IS NULL;
