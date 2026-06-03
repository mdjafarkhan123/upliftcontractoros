-- =========================================================================
-- INBOX HARDENING — Migration 2
-- Search vector + tags GIN + email threading column + perf indexes
-- =========================================================================

-- ── Message full-text search ─────────────────────────────────────────────────
ALTER TABLE "messages"
  ADD COLUMN IF NOT EXISTS "search_vector" tsvector
    GENERATED ALWAYS AS (to_tsvector('english', coalesce(body, ''))) STORED;

-- messages table is immutable — no deleted_at column — index covers all rows
CREATE INDEX IF NOT EXISTS "messages_search_vector_idx"
  ON "messages" USING GIN ("search_vector");

CREATE INDEX IF NOT EXISTS "messages_org_conv_created_idx"
  ON "messages" ("org_id", "conversation_id", "created_at" DESC);

-- ── Conversation tags GIN index ──────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "conversations_tags_idx"
  ON "conversations" USING GIN ("tags");

-- ── Email threading — dedicated column ──────────────────────────────────────
ALTER TABLE "messages"
  ADD COLUMN IF NOT EXISTS "email_message_id" text;

CREATE INDEX IF NOT EXISTS "messages_email_message_id_idx"
  ON "messages" ("email_message_id")
  WHERE "email_message_id" IS NOT NULL;

-- ── Inbox performance indexes ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "conversations_unread_idx"
  ON "conversations" ("org_id", "unread_count")
  WHERE "unread_count" > 0;

CREATE INDEX IF NOT EXISTS "conversations_last_message_idx"
  ON "conversations" ("org_id", "last_message_at" DESC)
  WHERE "deleted_at" IS NULL;
