-- Stage 3.c.1: migrate missed-call text-back onto the sequence engine.
-- Backfills one `missed_call` sequence per existing org from automation_settings.
-- (New orgs are seeded by seedAutomationSequences() in orgProvisioning.ts.)
-- SMS-only by design — they called, you text back.
INSERT INTO "automation_sequences" ("org_id", "key", "enabled", "channel")
SELECT
	s."org_id",
	'missed_call',
	s."missed_call_textback_enabled",
	'sms_only'::"automation_step_channel"
FROM "automation_settings" s
ON CONFLICT ("org_id", "key") DO NOTHING;--> statement-breakpoint
-- Seed step 0 (instant text-back) from the org's existing missed_call_textback_message.
INSERT INTO "automation_sequence_steps" ("org_id", "sequence_id", "position", "delay_minutes", "channel", "sms_body", "email_subject", "email_body")
SELECT seq."org_id", seq."id", 0, 0, NULL, s."missed_call_textback_message", NULL, NULL
FROM "automation_sequences" seq
JOIN "automation_settings" s ON s."org_id" = seq."org_id"
WHERE seq."key" = 'missed_call'
ON CONFLICT ("sequence_id", "position") DO NOTHING;--> statement-breakpoint
-- Seed default SMS-only follow-up steps (PLAN.md Card 2). Editable in the 3.d config UI.
INSERT INTO "automation_sequence_steps" ("org_id", "sequence_id", "position", "delay_minutes", "channel", "sms_body", "email_subject", "email_body")
SELECT seq."org_id", seq."id", v.position, v.delay_minutes, 'sms_only'::"automation_step_channel", v.sms_body, NULL, NULL
FROM "automation_sequences" seq
CROSS JOIN (VALUES
	(1, 120, 'Hi {contact_name}, we tried reaching you earlier. Still need a hand? Reply here and we''ll help right away.'),
	(2, 1440, E'Hi {contact_name}, following up one more time from {org_name} — happy to help whenever you''re ready. Just reply here.')
) AS v(position, delay_minutes, sms_body)
WHERE seq."key" = 'missed_call'
ON CONFLICT ("sequence_id", "position") DO NOTHING;
