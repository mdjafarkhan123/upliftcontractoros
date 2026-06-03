-- Pipeline forecasting.
--
-- Adds `pipeline_stages.probability` (0–100, NULL = not configured → excluded
-- from weighted forecast math) and `opportunities.expected_close_date` (date,
-- nullable — contractors don't always know).
--
-- Existing opportunities are not backfilled with an expected close date.
-- Probability is backfilled per default stage name; rows with custom stage
-- names remain NULL until configured.

ALTER TABLE "pipeline_stages"
  ADD COLUMN "probability" integer;

ALTER TABLE "opportunities"
  ADD COLUMN "expected_close_date" date;

UPDATE "pipeline_stages" SET "probability" = 10  WHERE "name" = 'New Lead'           AND "probability" IS NULL;
UPDATE "pipeline_stages" SET "probability" = 25  WHERE "name" = 'Contacted'          AND "probability" IS NULL;
UPDATE "pipeline_stages" SET "probability" = 40  WHERE "name" = 'Estimate Scheduled' AND "probability" IS NULL;
UPDATE "pipeline_stages" SET "probability" = 60  WHERE "name" = 'Quoted'             AND "probability" IS NULL;
UPDATE "pipeline_stages" SET "probability" = 75  WHERE "name" = 'Follow-Up'          AND "probability" IS NULL;
UPDATE "pipeline_stages" SET "probability" = 100 WHERE "is_won"  = true              AND "probability" IS NULL;
UPDATE "pipeline_stages" SET "probability" = 0   WHERE "is_lost" = true              AND "probability" IS NULL;
