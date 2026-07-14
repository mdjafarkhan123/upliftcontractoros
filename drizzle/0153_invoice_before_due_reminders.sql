-- 5.2: invoice reminders move to DUE-DATE OFFSET timing (before/on/after the due
-- date), matching the Jobber/QuickBooks/Housecall cadence. New orgs are seeded
-- with the before→on→after schedule in seedAutomationSequences(); this backfills
-- EXISTING orgs.
--
-- Safe conversion (no behaviour change): every existing invoice_dunning step was
-- stored as a forward delay-chain measured from the due date. We convert each step
-- to the equivalent DUE-DATE OFFSET by taking the running (cumulative) sum of the
-- delay chain, so its actual fire time is unchanged — we only switch the storage
-- representation from delay to offset so the editor renders it in the new
-- before/after mode. We do NOT force the new "before due" nudge onto existing
-- orgs; they keep exactly what they configured. Idempotent: only rows still in
-- delay mode (offset_minutes IS NULL) are touched.

UPDATE "automation_sequence_steps" AS st
SET "offset_minutes" = calc."cum",
    "delay_minutes" = 0,
    "updated_at" = now()
FROM (
	SELECT s."id",
		SUM(s."delay_minutes") OVER (
			PARTITION BY s."sequence_id"
			ORDER BY s."position"
			ROWS UNBOUNDED PRECEDING
		) AS "cum"
	FROM "automation_sequence_steps" s
	JOIN "automation_sequences" seq ON seq."id" = s."sequence_id"
	WHERE seq."key" = 'invoice_dunning'
		AND s."offset_minutes" IS NULL
) AS calc
WHERE st."id" = calc."id";
