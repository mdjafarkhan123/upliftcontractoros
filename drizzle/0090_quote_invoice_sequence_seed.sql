-- Stage 3.c.2: migrate quote follow-up + invoice dunning onto the sequence engine.
-- Backfills one sequence per existing org from automation_settings, mirroring the
-- go-forward seed in seedAutomationSequences() (orgProvisioning.ts). Clean port —
-- same cadence/copy/channel as the old hardcoded handlers (SMS-only). Editable in
-- the 3.d config UI. Keep this copy in sync with the seed helper.

-- ── quote_followup ───────────────────────────────────────────────────────────
-- Sequence (SMS-only, contact-anchored; runs from quote.sent time).
INSERT INTO "automation_sequences" ("org_id", "key", "enabled", "channel")
SELECT s."org_id", 'quote_followup', s."quote_followup_enabled", 'sms_only'::"automation_step_channel"
FROM "automation_settings" s
ON CONFLICT ("org_id", "key") DO NOTHING;--> statement-breakpoint
-- Step 0: first follow-up at delay_1 hours. Step 1: second at delay_2 hours
-- (delay_minutes chains from the previous step). Both reuse quote_followup_message.
INSERT INTO "automation_sequence_steps" ("org_id", "sequence_id", "position", "delay_minutes", "channel", "sms_body", "email_subject", "email_body")
SELECT seq."org_id", seq."id", 0, s."quote_followup_delay_1_hours" * 60, NULL, s."quote_followup_message", NULL, NULL
FROM "automation_sequences" seq
JOIN "automation_settings" s ON s."org_id" = seq."org_id"
WHERE seq."key" = 'quote_followup'
ON CONFLICT ("sequence_id", "position") DO NOTHING;--> statement-breakpoint
INSERT INTO "automation_sequence_steps" ("org_id", "sequence_id", "position", "delay_minutes", "channel", "sms_body", "email_subject", "email_body")
SELECT seq."org_id", seq."id", 1, GREATEST(s."quote_followup_delay_2_hours" - s."quote_followup_delay_1_hours", 0) * 60, NULL, s."quote_followup_message", NULL, NULL
FROM "automation_sequences" seq
JOIN "automation_settings" s ON s."org_id" = seq."org_id"
WHERE seq."key" = 'quote_followup'
ON CONFLICT ("sequence_id", "position") DO NOTHING;--> statement-breakpoint

-- ── invoice_dunning ──────────────────────────────────────────────────────────
-- Sequence (SMS-only, invoice-anchored; steps fire at due_date + offset).
INSERT INTO "automation_sequences" ("org_id", "key", "enabled", "channel")
SELECT s."org_id", 'invoice_dunning', s."invoice_reminder_enabled", 'sms_only'::"automation_step_channel"
FROM "automation_settings" s
ON CONFLICT ("org_id", "key") DO NOTHING;--> statement-breakpoint
-- Dunning cadence: due+0 / +3d / +7d / +14d (delay_minutes chains from prev step:
-- 0, 3d, 4d, 7d → cumulative 0/3/7/14). All reuse invoice_reminder_message.
INSERT INTO "automation_sequence_steps" ("org_id", "sequence_id", "position", "delay_minutes", "channel", "sms_body", "email_subject", "email_body")
SELECT seq."org_id", seq."id", v.position, v.delay_minutes, NULL, s."invoice_reminder_message", NULL, NULL
FROM "automation_sequences" seq
JOIN "automation_settings" s ON s."org_id" = seq."org_id"
CROSS JOIN (VALUES
	(0, 0),
	(1, 4320),
	(2, 5760),
	(3, 10080)
) AS v(position, delay_minutes)
WHERE seq."key" = 'invoice_dunning'
ON CONFLICT ("sequence_id", "position") DO NOTHING;
