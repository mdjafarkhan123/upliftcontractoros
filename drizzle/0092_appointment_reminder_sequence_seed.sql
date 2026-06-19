-- Stage 3.c.3: migrate appointment reminders onto the sequence engine.
-- Backfills one appointment_reminder sequence per existing org from
-- automation_settings, mirroring the go-forward seed in seedAutomationSequences()
-- (orgProvisioning.ts). Clean port — SMS-only, same 24h/1h cadence and copy as the
-- old hardcoded reminders. Steps carry NEGATIVE offset_minutes so the engine fires
-- them relative to the appointment's scheduled_start (-1440 = 24h before, -60 = 1h
-- before). Keep this copy in sync with the seed helper.

-- ── appointment_reminder ─────────────────────────────────────────────────────
-- Sequence (SMS-only, appointment-anchored; steps fire at scheduled_start + offset).
INSERT INTO "automation_sequences" ("org_id", "key", "enabled", "channel")
SELECT s."org_id", 'appointment_reminder', s."appointment_reminder_enabled", 'sms_only'::"automation_step_channel"
FROM "automation_settings" s
ON CONFLICT ("org_id", "key") DO NOTHING;--> statement-breakpoint
-- Step 0: 24h before (offset -1440), reminder message. Both reminders always fire;
-- the 1h toggle only swaps the copy, matching the old handler's behaviour.
INSERT INTO "automation_sequence_steps" ("org_id", "sequence_id", "position", "delay_minutes", "offset_minutes", "channel", "sms_body", "email_subject", "email_body")
SELECT seq."org_id", seq."id", 0, 0, -1440, NULL, s."appointment_reminder_message", NULL, NULL
FROM "automation_sequences" seq
JOIN "automation_settings" s ON s."org_id" = seq."org_id"
WHERE seq."key" = 'appointment_reminder'
ON CONFLICT ("sequence_id", "position") DO NOTHING;--> statement-breakpoint
-- Step 1: 1h before (offset -60). Uses the dedicated 1h message when enabled and
-- present, otherwise the shared reminder message.
INSERT INTO "automation_sequence_steps" ("org_id", "sequence_id", "position", "delay_minutes", "offset_minutes", "channel", "sms_body", "email_subject", "email_body")
SELECT seq."org_id", seq."id", 1, 0, -60, NULL,
	CASE WHEN s."appointment_reminder_1h_enabled" AND s."appointment_reminder_1h_message" IS NOT NULL AND s."appointment_reminder_1h_message" <> ''
		THEN s."appointment_reminder_1h_message"
		ELSE s."appointment_reminder_message"
	END,
	NULL, NULL
FROM "automation_sequences" seq
JOIN "automation_settings" s ON s."org_id" = seq."org_id"
WHERE seq."key" = 'appointment_reminder'
ON CONFLICT ("sequence_id", "position") DO NOTHING;
