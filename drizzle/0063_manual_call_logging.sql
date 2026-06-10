-- Manual call logging (P0).
-- After a contractor taps a `tel:` link and returns to the app, they can log the
-- call into the conversation timeline. Storage reuses the `messages` table:
--   * new `message_channel` value `'call'` (distinct from `'missed_call'`, which is
--     the auto inbound row Twilio creates),
--   * new `call_outcome` enum,
--   * `call_outcome` + `call_duration_seconds` columns on `messages`.
-- Pure local write — no transport, no outbox/worker. Tenant isolation stays at the
-- API/service-role layer (matches existing migration convention).

-- 1. New channel value on the existing enum. Additive; safe. Not USED in this tx,
--    so it is valid inside the migration transaction (PG12+).
ALTER TYPE "message_channel" ADD VALUE IF NOT EXISTS 'call';--> statement-breakpoint

-- 2. Call outcome enum.
DO $$ BEGIN
	CREATE TYPE "call_outcome" AS ENUM ('spoke', 'voicemail', 'no_answer', 'follow_up_scheduled');
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

-- 3. Per-message call metadata. Both nullable — set only on 'call' rows.
ALTER TABLE "messages"
	ADD COLUMN IF NOT EXISTS "call_outcome" "call_outcome";--> statement-breakpoint

ALTER TABLE "messages"
	ADD COLUMN IF NOT EXISTS "call_duration_seconds" integer;
