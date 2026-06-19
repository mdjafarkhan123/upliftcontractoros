-- Pipeline Gap #5: Convert lost_reason from free text to a structured pick list.
-- Adds pipeline_lost_reason enum, migrates any existing free-text values to
-- 'other' (preserving the original text in the new lost_reason_note column),
-- then re-types the column.

CREATE TYPE "public"."pipeline_lost_reason" AS ENUM('price', 'competitor', 'timing', 'no_response', 'other');
--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "lost_reason_note" text;
--> statement-breakpoint
-- Preserve any existing free-text reasons before re-typing the column.
UPDATE "opportunities"
SET "lost_reason_note" = LEFT("lost_reason", 500)
WHERE "lost_reason" IS NOT NULL;
--> statement-breakpoint
-- Blank all existing text values so the USING cast succeeds (they go to 'other').
UPDATE "opportunities"
SET "lost_reason" = 'other'
WHERE "lost_reason" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "opportunities"
  ALTER COLUMN "lost_reason" TYPE "public"."pipeline_lost_reason"
  USING "lost_reason"::"public"."pipeline_lost_reason";
