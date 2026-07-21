-- Data backfill (no schema change): heal visits that were "orphan-billed" to a soft-deleted
-- invoice. Before the invoice-DELETE rewrite (this session, alongside migration 0172), deleting an
-- invoice left its visits' billed_invoice_id set. Such a visit then looked permanently billed and
-- never returned to the "Select visits to invoice" picker, and its auto invoice-reminder stayed
-- discharged. This applies to those old rows exactly what the new DELETE now does live: un-bill the
-- visit, revert any invoice-driven completion, and reopen the discharged auto reminder.
--
-- Scope is strictly visits whose linked invoice is ALREADY soft-deleted (invoices.deleted_at set) —
-- nothing else is touched. No outbox events: these are historical corrections, nothing to notify.

-- 1) Revert completions that were caused by an invoice which is now deleted (marker-driven; a
--    crew-entered completion has completed_via_invoice_id NULL and is never affected).
UPDATE "appointments" a
SET "status" = 'scheduled',
    "completed_at" = NULL,
    "completed_by" = NULL,
    "completed_via_invoice_id" = NULL,
    "updated_at" = now()
FROM "invoices" i
WHERE a."completed_via_invoice_id" = i."id"
  AND i."deleted_at" IS NOT NULL;
--> statement-breakpoint

-- 2) Reopen the auto invoice-reminders discharged for visits whose billed invoice is deleted.
--    Runs BEFORE step 3 because it joins on the still-present billed_invoice_id.
UPDATE "job_invoice_reminders" r
SET "status" = 'active',
    "completed_at" = NULL,
    "completed_by" = NULL,
    "updated_at" = now()
FROM "appointments" a
JOIN "invoices" i ON i."id" = a."billed_invoice_id"
WHERE r."visit_id" = a."id"
  AND i."deleted_at" IS NOT NULL
  AND r."source" = 'auto'
  AND r."status" = 'completed'
  AND r."deleted_at" IS NULL;
--> statement-breakpoint

-- 3) Un-bill every visit whose billed invoice is deleted — clearing the stale link so it reappears
--    in the picker and rejoins the job's "Requires Invoicing" set.
UPDATE "appointments" a
SET "billed_invoice_id" = NULL,
    "updated_at" = now()
FROM "invoices" i
WHERE a."billed_invoice_id" = i."id"
  AND i."deleted_at" IS NOT NULL;
