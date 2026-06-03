-- Manual job creation support.
--
-- Allow Jobs to exist without a parent Opportunity (callbacks, warranty visits,
-- repeat customers, backfill). Preserve the 1-Opp-1-Job invariant for
-- pipeline-born jobs via a partial unique index.
--
-- `source` records origin so reporting can distinguish pipeline-driven jobs
-- from operationally-created ones.

-- 1. New enum
CREATE TYPE "job_source" AS ENUM ('opportunity', 'manual');

-- 2. Add column with default for back-compat (existing rows came from opps)
ALTER TABLE "jobs"
  ADD COLUMN "source" "job_source" NOT NULL DEFAULT 'opportunity';

-- 3. Drop the old NOT NULL on opportunity_id
ALTER TABLE "jobs" ALTER COLUMN "opportunity_id" DROP NOT NULL;

-- 4. Drop the old plain UNIQUE constraint, replace with partial unique index
ALTER TABLE "jobs" DROP CONSTRAINT IF EXISTS "jobs_opportunity_id_unique";

CREATE UNIQUE INDEX "jobs_opportunity_id_unique_idx"
  ON "jobs" ("opportunity_id")
  WHERE "opportunity_id" IS NOT NULL;
