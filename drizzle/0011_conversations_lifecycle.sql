-- Migration 3: Add lifecycle fields to conversations for clean webchat session expiry
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "closed_at" timestamptz;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "closed_reason" text;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_conversations_closed_reason" ON "conversations" ("closed_reason") WHERE "closed_reason" IS NOT NULL;
