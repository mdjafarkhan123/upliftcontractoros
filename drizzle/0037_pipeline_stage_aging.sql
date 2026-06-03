-- Pipeline stuck-opportunity tracking.
--
-- Adds `opportunities.stage_entered_at` (when the row entered its current stage)
-- and `pipeline_stages.stale_after_days` (per-stage threshold; NULL = never stale).
--
-- Historical accuracy: existing opportunities are backfilled from `created_at`
-- only. We do NOT backfill from `updated_at` because non-stage edits (title,
-- value, assignee) would overstate aging. Accurate stage-aging starts at
-- deployment for the next stage transition.

ALTER TABLE "pipeline_stages"
  ADD COLUMN "stale_after_days" integer;

ALTER TABLE "opportunities"
  ADD COLUMN "stage_entered_at" timestamp with time zone NOT NULL DEFAULT now();

UPDATE "opportunities" SET "stage_entered_at" = "created_at";

UPDATE "pipeline_stages" SET "stale_after_days" = 2 WHERE "name" = 'New Lead' AND "stale_after_days" IS NULL;
UPDATE "pipeline_stages" SET "stale_after_days" = 3 WHERE "name" = 'Contacted' AND "stale_after_days" IS NULL;
UPDATE "pipeline_stages" SET "stale_after_days" = 5 WHERE "name" = 'Estimate Scheduled' AND "stale_after_days" IS NULL;
UPDATE "pipeline_stages" SET "stale_after_days" = 5 WHERE "name" = 'Quoted' AND "stale_after_days" IS NULL;
UPDATE "pipeline_stages" SET "stale_after_days" = 5 WHERE "name" = 'Follow-Up' AND "stale_after_days" IS NULL;
