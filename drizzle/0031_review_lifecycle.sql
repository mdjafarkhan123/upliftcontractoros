-- Review Lifecycle & Attribution Engine — schema groundwork.
--
-- Pre-production: no backward compatibility required. The status column and
-- its enum are dropped and recreated from scratch with only the 6 active
-- lifecycle states. Any existing review_requests rows are treated as
-- disposable dev data.

------------------------------------------------------------------------------
-- 1. Clean reset of review_request_status enum
------------------------------------------------------------------------------
ALTER TABLE "review_requests" DROP COLUMN "status";--> statement-breakpoint

DROP TYPE "review_request_status";--> statement-breakpoint

CREATE TYPE "review_request_status" AS ENUM (
  'scheduled',
  'sent',
  'engaged',
  'likely_reviewed',
  'completed_internal',
  'expired'
);--> statement-breakpoint

ALTER TABLE "review_requests"
  ADD COLUMN "status" "review_request_status" NOT NULL DEFAULT 'scheduled';--> statement-breakpoint

------------------------------------------------------------------------------
-- 2. New review_event_type enum
------------------------------------------------------------------------------
CREATE TYPE "review_event_type" AS ENUM (
  'sent',
  'link_opened',
  'rating_submitted',
  'redirected_to_google',
  'reminder_sent',
  'nudge_sent',
  'expired',
  'attributed'
);--> statement-breakpoint

------------------------------------------------------------------------------
-- 3. review_requests: rename + add lifecycle columns
------------------------------------------------------------------------------
ALTER TABLE "review_requests" RENAME COLUMN "response_score" TO "submitted_rating";--> statement-breakpoint

ALTER TABLE "review_requests"
  DROP CONSTRAINT IF EXISTS "review_requests_response_score_check";--> statement-breakpoint

ALTER TABLE "review_requests"
  ADD CONSTRAINT "review_requests_submitted_rating_check"
  CHECK ("submitted_rating" IS NULL OR ("submitted_rating" >= 1 AND "submitted_rating" <= 5));--> statement-breakpoint

ALTER TABLE "review_requests"
  ADD COLUMN "engaged_at" timestamp with time zone,
  ADD COLUMN "redirected_to_google_at" timestamp with time zone,
  ADD COLUMN "completed_at" timestamp with time zone,
  ADD COLUMN "expired_at" timestamp with time zone,
  ADD COLUMN "nudge_count" integer NOT NULL DEFAULT 0,
  ADD COLUMN "confidence_score" numeric(3,2),
  ADD COLUMN "attributed_at" timestamp with time zone;--> statement-breakpoint

ALTER TABLE "review_requests"
  DROP COLUMN IF EXISTS "reminder_sent_at",
  DROP COLUMN IF EXISTS "reminder_bull_job_id";--> statement-breakpoint

-- Business-rule CHECKs (placed AFTER columns exist).
-- Engaged means the customer submitted SOME rating (1–5), not only high ratings.
ALTER TABLE "review_requests"
  ADD CONSTRAINT "review_requests_engaged_requires_rating_check"
  CHECK (status <> 'engaged' OR submitted_rating IS NOT NULL);--> statement-breakpoint

-- Completed_internal requires a rating, and that rating must be ≤ 3.
ALTER TABLE "review_requests"
  ADD CONSTRAINT "review_requests_completed_internal_rating_check"
  CHECK (
    status <> 'completed_internal'
    OR (submitted_rating IS NOT NULL AND submitted_rating <= 3)
  );--> statement-breakpoint

------------------------------------------------------------------------------
-- 4. Worker hot-path indexes
------------------------------------------------------------------------------
-- Attribution candidate selection: org-scoped, engaged, not yet attributed.
CREATE INDEX IF NOT EXISTS "idx_review_requests_engaged_candidates"
  ON "review_requests" ("org_id", "engaged_at")
  WHERE "status" = 'engaged' AND "attributed_at" IS NULL;--> statement-breakpoint

-- Reminder / expiry scans: still-active rows ordered by sent_at.
CREATE INDEX IF NOT EXISTS "idx_review_requests_active_sent_at"
  ON "review_requests" ("status", "sent_at")
  WHERE "status" IN ('sent', 'engaged');--> statement-breakpoint

------------------------------------------------------------------------------
-- 5. review_events — append-only funnel log
------------------------------------------------------------------------------
CREATE TABLE "review_events" (
  "id"                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"            uuid NOT NULL REFERENCES "organizations" ("id"),
  "review_request_id" uuid NOT NULL REFERENCES "review_requests" ("id"),
  "type"              "review_event_type" NOT NULL,
  "rating"            integer,
  "nudge_number"      integer,
  "confidence_score"  numeric(3,2),
  "meta"              jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at"        timestamp with time zone NOT NULL DEFAULT now()
);--> statement-breakpoint

CREATE INDEX "idx_review_events_request_id"
  ON "review_events" ("review_request_id", "created_at");--> statement-breakpoint

CREATE INDEX "idx_review_events_org_id"
  ON "review_events" ("org_id", "created_at" DESC);--> statement-breakpoint

------------------------------------------------------------------------------
-- 6. review_events: RLS
------------------------------------------------------------------------------
-- Mirrors the SELECT-only pattern used by review_requests / reviews /
-- private_feedback in migration 0000. All writes go through service role via
-- /api/*; authenticated members only read events for their own org.
ALTER TABLE "review_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY "review_events: members select own org events"
  ON "review_events"
  AS PERMISSIVE
  FOR SELECT
  TO "authenticated"
  USING (org_id = get_my_org_id());--> statement-breakpoint

------------------------------------------------------------------------------
-- 7. organizations: Google review baseline for attribution engine
------------------------------------------------------------------------------
-- No RLS change needed; columns are added to an already-protected table.
ALTER TABLE "organizations"
  ADD COLUMN "last_known_review_count" integer NOT NULL DEFAULT 0,
  ADD COLUMN "last_review_check_at" timestamp with time zone;
