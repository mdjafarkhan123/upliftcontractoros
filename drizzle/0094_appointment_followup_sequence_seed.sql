-- Stage 3.c.3b — net-new appointment follow-up cards.
-- Backfills two sequences per existing org, mirroring the go-forward seed in
-- seedAutomationSequences() (orgProvisioning.ts). Both are seeded DISABLED — they
-- are net-new behaviours with no automation_settings field driving them, so they
-- stay opt-in until the 3.d UI exposes them. Keep this copy in sync with the seed
-- helper.

-- ── appointment_no_show ──────────────────────────────────────────────────────
-- Customer SMS re-engagement, contact-anchored (like missed_call): instant text
-- when staff mark a no-show + one follow-up at +1 day.
INSERT INTO "automation_sequences" ("org_id", "key", "enabled", "channel")
SELECT s."org_id", 'appointment_no_show', false, 'sms_only'::"automation_step_channel"
FROM "automation_settings" s
ON CONFLICT ("org_id", "key") DO NOTHING;--> statement-breakpoint
INSERT INTO "automation_sequence_steps" ("org_id", "sequence_id", "position", "delay_minutes", "channel", "sms_body", "email_subject", "email_body")
SELECT seq."org_id", seq."id", 0, 0, NULL,
	'Hi {contact_name}, sorry we missed you for your appointment. Would you like to reschedule? Reply here and we''ll find a new time.',
	NULL, NULL
FROM "automation_sequences" seq
WHERE seq."key" = 'appointment_no_show'
ON CONFLICT ("sequence_id", "position") DO NOTHING;--> statement-breakpoint
INSERT INTO "automation_sequence_steps" ("org_id", "sequence_id", "position", "delay_minutes", "channel", "sms_body", "email_subject", "email_body")
SELECT seq."org_id", seq."id", 1, 1440, NULL,
	'Hi {contact_name}, still happy to help whenever you''re ready — reply here and we''ll get you back on the calendar.',
	NULL, NULL
FROM "automation_sequences" seq
WHERE seq."key" = 'appointment_no_show'
ON CONFLICT ("sequence_id", "position") DO NOTHING;--> statement-breakpoint

-- ── appointment_quote_nudge ──────────────────────────────────────────────────
-- STAFF in-app nudge ~2h after a completed appointment (offset +120) IF no quote
-- was raised for the contact since the visit. audience='staff' routes the engine
-- to notify the office/crew instead of the customer; email_subject = the title,
-- sms_body = the body.
INSERT INTO "automation_sequences" ("org_id", "key", "enabled", "channel")
SELECT s."org_id", 'appointment_quote_nudge', false, 'sms_only'::"automation_step_channel"
FROM "automation_settings" s
ON CONFLICT ("org_id", "key") DO NOTHING;--> statement-breakpoint
INSERT INTO "automation_sequence_steps" ("org_id", "sequence_id", "position", "delay_minutes", "offset_minutes", "audience", "condition", "channel", "sms_body", "email_subject", "email_body")
SELECT seq."org_id", seq."id", 0, 0, 120, 'staff', 'no_quote_since_anchor', NULL,
	'You completed an appointment with {contact_name} but haven''t sent a quote yet. Follow up to win the job.',
	'No quote sent yet for {contact_name}',
	NULL
FROM "automation_sequences" seq
WHERE seq."key" = 'appointment_quote_nudge'
ON CONFLICT ("sequence_id", "position") DO NOTHING;
