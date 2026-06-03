-- =========================================================================
-- INBOX HARDENING — Migration 1
-- Quick replies table + RLS
-- =========================================================================

CREATE TABLE IF NOT EXISTS "quick_replies" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"      uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "created_by"  uuid REFERENCES "org_members"("id") ON DELETE SET NULL,
  "title"       text NOT NULL,
  "body"        text NOT NULL,
  "channel"     text NOT NULL DEFAULT 'any',
  "sort_order"  integer NOT NULL DEFAULT 0,
  "is_archived" boolean NOT NULL DEFAULT false,
  "created_at"  timestamptz NOT NULL DEFAULT now(),
  "updated_at"  timestamptz NOT NULL DEFAULT now()
);

-- Functional unique index — DB-level case-insensitive, trim-aware uniqueness
CREATE UNIQUE INDEX IF NOT EXISTS "quick_replies_org_title_unique"
  ON "quick_replies" ("org_id", lower(trim("title")))
  WHERE "is_archived" = false;

CREATE INDEX IF NOT EXISTS "quick_replies_org_id_idx"
  ON "quick_replies" ("org_id", "sort_order")
  WHERE "is_archived" = false;

-- RLS — service-role mutations only; SELECT scoped to caller's org.
ALTER TABLE "quick_replies" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "quick_replies: org rows" ON "quick_replies";

CREATE POLICY "quick_replies: org rows"
  ON "quick_replies"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ("org_id" = get_my_org_id());
