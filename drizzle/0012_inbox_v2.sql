-- Migration: Inbox v2 — conversation-centric unified inbox
--
-- Goals:
--   * Remove channel ownership from conversations (it now lives only on messages).
--   * Add operational metadata (snooze, preview, last_*_at, first_response_at).
--   * Add email transport columns to messages.
--   * Add inbound_communication_events audit table.
--   * Recreate conversation_status as ('open','closed','snoozed') — migrate 'archived' to 'closed'.
--   * Keep message_channel as-is (sms, missed_call, email, webchat).
--   * Do NOT enforce one-open-conversation-per-contact at DB level. App layer decides threading.
--
-- This migration is additive + backfill + enum recreate. No destructive merge of conversations.

-- ============================================================
-- 1. conversations — additive columns (all nullable initially)
-- ============================================================

ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "reply_alias" text;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "last_message_preview" text;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "last_inbound_at" timestamptz;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "last_outbound_at" timestamptz;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "last_inbound_email_at" timestamptz;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "last_outbound_email_at" timestamptz;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "first_response_at" timestamptz;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "snoozed_until" timestamptz;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "snoozed_by" uuid REFERENCES "org_members"("id");--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "closed_by" uuid REFERENCES "org_members"("id");--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "last_message_channel" "message_channel";--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "last_message_direction" "message_direction";--> statement-breakpoint

-- ============================================================
-- 2. messages — additive columns
-- ============================================================

ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "reply_to_message_id" uuid REFERENCES "messages"("id");--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "failure_reason" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "failed_at" timestamptz;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "source" text;--> statement-breakpoint

-- Email transport metadata
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "email_provider" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "email_provider_message_id" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "email_subject" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "email_from_address" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "email_to_addresses" text[];--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "email_cc_addresses" text[];--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "email_in_reply_to" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "email_references" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "opened_at" timestamptz;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "delivered_at" timestamptz;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "bounced_at" timestamptz;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "bounce_type" text;--> statement-breakpoint

-- ============================================================
-- 3. Backfill conversation operational metadata from messages
-- ============================================================

-- last_message_preview / last_message_channel / last_message_direction
-- from the most recent non-deleted message per conversation.
WITH latest AS (
  SELECT DISTINCT ON (conversation_id)
    conversation_id,
    channel,
    direction,
    body,
    created_at
  FROM messages
  ORDER BY conversation_id, created_at DESC
)
UPDATE conversations c
SET
  last_message_preview = CASE
    WHEN latest.channel = 'missed_call' THEN 'Missed phone call'
    ELSE LEFT(COALESCE(latest.body, ''), 140)
  END,
  last_message_channel = latest.channel,
  last_message_direction = latest.direction
FROM latest
WHERE c.id = latest.conversation_id;--> statement-breakpoint

-- last_inbound_at / last_outbound_at
UPDATE conversations c
SET last_inbound_at = sub.max_at
FROM (
  SELECT conversation_id, MAX(created_at) AS max_at
  FROM messages
  WHERE direction = 'inbound'
  GROUP BY conversation_id
) sub
WHERE c.id = sub.conversation_id;--> statement-breakpoint

UPDATE conversations c
SET last_outbound_at = sub.max_at
FROM (
  SELECT conversation_id, MAX(created_at) AS max_at
  FROM messages
  WHERE direction = 'outbound'
  GROUP BY conversation_id
) sub
WHERE c.id = sub.conversation_id;--> statement-breakpoint

-- first_response_at — first outbound message that follows the first inbound message
UPDATE conversations c
SET first_response_at = sub.first_outbound_after_inbound
FROM (
  SELECT
    m_out.conversation_id,
    MIN(m_out.created_at) AS first_outbound_after_inbound
  FROM messages m_out
  JOIN (
    SELECT conversation_id, MIN(created_at) AS first_inbound_at
    FROM messages
    WHERE direction = 'inbound'
    GROUP BY conversation_id
  ) m_in ON m_in.conversation_id = m_out.conversation_id
  WHERE m_out.direction = 'outbound'
    AND m_out.created_at >= m_in.first_inbound_at
  GROUP BY m_out.conversation_id
) sub
WHERE c.id = sub.conversation_id;--> statement-breakpoint

-- Email-specific backfill (no-op until email messages exist, but safe to run)
UPDATE conversations c
SET last_inbound_email_at = sub.max_at
FROM (
  SELECT conversation_id, MAX(created_at) AS max_at
  FROM messages
  WHERE direction = 'inbound' AND channel = 'email'
  GROUP BY conversation_id
) sub
WHERE c.id = sub.conversation_id;--> statement-breakpoint

UPDATE conversations c
SET last_outbound_email_at = sub.max_at
FROM (
  SELECT conversation_id, MAX(created_at) AS max_at
  FROM messages
  WHERE direction = 'outbound' AND channel = 'email'
  GROUP BY conversation_id
) sub
WHERE c.id = sub.conversation_id;--> statement-breakpoint

-- ============================================================
-- 4. Drop the channel-dependent unique index BEFORE dropping the column.
-- ============================================================

DROP INDEX IF EXISTS "idx_conversations_open_contact_channel";--> statement-breakpoint

-- ============================================================
-- 5. Recreate conversation_status enum: ('open','closed','snoozed').
--    Migrate any 'archived' rows to 'closed'.
-- ============================================================

CREATE TYPE "conversation_status_new" AS ENUM ('open', 'closed', 'snoozed');--> statement-breakpoint

ALTER TABLE "conversations" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint

ALTER TABLE "conversations"
  ALTER COLUMN "status" TYPE "conversation_status_new"
  USING (
    CASE
      WHEN status::text = 'archived' THEN 'closed'::conversation_status_new
      ELSE status::text::conversation_status_new
    END
  );--> statement-breakpoint

DROP TYPE "conversation_status";--> statement-breakpoint
ALTER TYPE "conversation_status_new" RENAME TO "conversation_status";--> statement-breakpoint

ALTER TABLE "conversations" ALTER COLUMN "status" SET DEFAULT 'open';--> statement-breakpoint

-- ============================================================
-- 6. Drop conversations.channel and conversation_channel enum.
-- ============================================================

ALTER TABLE "conversations" DROP COLUMN IF EXISTS "channel";--> statement-breakpoint
DROP TYPE IF EXISTS "conversation_channel";--> statement-breakpoint

-- ============================================================
-- 7. inbound_communication_events — raw webhook audit table
-- ============================================================

CREATE TABLE IF NOT EXISTS "inbound_communication_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "provider" text NOT NULL,
  "provider_event_id" text,
  "event_type" text NOT NULL,
  "raw_payload" jsonb NOT NULL,
  "processed_at" timestamptz,
  "error" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint

ALTER TABLE "inbound_communication_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY "inbound_communication_events: members select own org"
  ON "inbound_communication_events"
  AS PERMISSIVE FOR SELECT TO "authenticated"
  USING ("org_id" = get_my_org_id());--> statement-breakpoint

-- ============================================================
-- 8. Indexes (operational + email + audit)
-- ============================================================

-- Reply alias uniqueness for inbound email routing
CREATE UNIQUE INDEX IF NOT EXISTS "idx_conversations_org_reply_alias"
  ON "conversations" ("org_id", "reply_alias")
  WHERE "reply_alias" IS NOT NULL;--> statement-breakpoint

-- Snooze sweep (cron unsnooze)
CREATE INDEX IF NOT EXISTS "idx_conversations_snoozed_until"
  ON "conversations" ("snoozed_until")
  WHERE "status" = 'snoozed' AND "snoozed_until" IS NOT NULL;--> statement-breakpoint

-- Email inbox ordering
CREATE INDEX IF NOT EXISTS "idx_conversations_last_inbound_email"
  ON "conversations" ("org_id", "last_inbound_email_at" DESC)
  WHERE "last_inbound_email_at" IS NOT NULL;--> statement-breakpoint

-- Email webhook dedup lookup
CREATE INDEX IF NOT EXISTS "idx_messages_email_provider_lookup"
  ON "messages" ("org_id", "email_provider", "email_provider_message_id")
  WHERE "email_provider_message_id" IS NOT NULL;--> statement-breakpoint

-- Audit lookups
CREATE INDEX IF NOT EXISTS "idx_inbound_comm_org_provider"
  ON "inbound_communication_events" ("org_id", "provider");--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_inbound_comm_provider_event"
  ON "inbound_communication_events" ("provider", "provider_event_id")
  WHERE "provider_event_id" IS NOT NULL;
