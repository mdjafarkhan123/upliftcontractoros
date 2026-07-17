-- Jobber parity: job type (one-off vs recurring) becomes a STORED, user-decided fact.
--
-- Before this migration "recurring" was DERIVED at query time from `recurrence IS NOT NULL
-- OR schedule_as_needed`. That is the wrong model: Jobber stores `jobType` (ONE_OFF |
-- RECURRING) as a non-null enum set by the user's toggle at creation, and never infers it
-- from the rule or the visits — a one-off job may legitimately have several visits, so
-- neither the rule nor the visit count can tell the two apart.
--
-- Step 1 frees the `job_type` name: the OLD `job_type` column was never Jobber's enum, it
-- was free-text work category ("Repair", "Installation", "Maintenance"). RENAME (not
-- drop+create) so existing category values survive.
ALTER TABLE "jobs" RENAME COLUMN "job_type" TO "job_category";--> statement-breakpoint
CREATE TYPE "public"."job_type" AS ENUM('one_off', 'recurring');--> statement-breakpoint
-- Added nullable so the backfill can populate it before NOT NULL is enforced.
ALTER TABLE "jobs" ADD COLUMN "job_type" "public"."job_type";--> statement-breakpoint
-- Backfill reproduces the previous derivation EXACTLY, so no existing job changes what it
-- reads as. `schedule_as_needed` = Jobber's "As Needed — We Won't Prompt You": a recurring
-- job with no rule and no visits, which is precisely why the derived model needed it.
UPDATE "jobs" SET "job_type" = CASE
	WHEN "recurrence" IS NOT NULL OR "schedule_as_needed" THEN 'recurring'::"public"."job_type"
	ELSE 'one_off'::"public"."job_type"
END;--> statement-breakpoint
ALTER TABLE "jobs" ALTER COLUMN "job_type" SET NOT NULL;
