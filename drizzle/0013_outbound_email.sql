-- Migration: Chapter 5 — outbound email pipeline
--
-- Goals:
--   * Extend message_status enum with 'sending' and 'undeliverable' for the
--     async outbound email pipeline (queued → sending → sent → delivered).
--   * Add organizations.email_sender_local (per-org local-part on shared apex)
--     backfilled from slug; sanitised to [a-z0-9-].
--   * Add messages.send_attempts for worker retry bookkeeping.
--   * Add media.message_id so email attachments link to their message row, and
--     update the exactly-one-parent check constraint accordingly.

-- ============================================================
-- 1. message_status enum extension
-- ============================================================

ALTER TYPE "message_status" ADD VALUE IF NOT EXISTS 'sending';--> statement-breakpoint
ALTER TYPE "message_status" ADD VALUE IF NOT EXISTS 'undeliverable';--> statement-breakpoint

-- ============================================================
-- 2. organizations.email_sender_local
-- ============================================================

ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "email_sender_local" text;--> statement-breakpoint

-- Backfill from slug: lowercase, replace non-[a-z0-9-] with '-', trim leading/trailing '-'
UPDATE "organizations"
SET "email_sender_local" = regexp_replace(
  regexp_replace(lower(slug), '[^a-z0-9-]+', '-', 'g'),
  '(^-+|-+$)', '', 'g'
)
WHERE "email_sender_local" IS NULL;--> statement-breakpoint

-- Org-scoped uniqueness so two orgs cannot share a local-part on the shared apex.
CREATE UNIQUE INDEX IF NOT EXISTS "idx_organizations_email_sender_local"
  ON "organizations" ("email_sender_local")
  WHERE "email_sender_local" IS NOT NULL;--> statement-breakpoint

-- ============================================================
-- 3. messages.send_attempts
-- ============================================================

ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "send_attempts" integer NOT NULL DEFAULT 0;--> statement-breakpoint

-- ============================================================
-- 4. media.message_id + exactly-one-parent check update
-- ============================================================

ALTER TABLE "media" ADD COLUMN IF NOT EXISTS "message_id" uuid REFERENCES "messages"("id");--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_media_message_id"
  ON "media" ("message_id")
  WHERE "message_id" IS NOT NULL;--> statement-breakpoint

ALTER TABLE "media" DROP CONSTRAINT IF EXISTS "media_exactly_one_parent";--> statement-breakpoint

ALTER TABLE "media" ADD CONSTRAINT "media_exactly_one_parent" CHECK (
  (
    "purpose_tag" = 'org_logo'
    AND "job_id" IS NULL
    AND "quote_id" IS NULL
    AND "invoice_id" IS NULL
    AND "message_id" IS NULL
  )
  OR (
    "purpose_tag" <> 'org_logo'
    AND (
      ("job_id" IS NOT NULL)::int +
      ("quote_id" IS NOT NULL)::int +
      ("invoice_id" IS NOT NULL)::int +
      ("message_id" IS NOT NULL)::int = 1
    )
  )
);
