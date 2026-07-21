-- Jobber parity: collapse job_status to what Jobber actually PERSISTS — open vs closed.
--
-- The old 5-value enum (scheduled / in_progress / on_hold / completed / cancelled) mixed two
-- different things: a couple of DERIVED faces (scheduled/in_progress — Jobber never stores these,
-- it computes Upcoming/Today/etc. from the visits) and the real close states. Jobber's model is
-- just active vs archived; a job that is finished OR called off is "archived", and WHY it closed is
-- read from completed_at / cancelled_at (both already exist), which keep driving the job.completed /
-- job.cancelled outbox events + the review automation.
--
-- drizzle-kit's default generate for this is destructive: it casts the existing text values straight
-- into the new enum, which fails on 'scheduled'/'in_progress'/'completed'/'cancelled'. This
-- hand-written version remaps every old value safely. job_status is used ONLY on jobs.status.
--
-- Mapping (confirmed with the user): scheduled/in_progress/on_hold -> active ; completed/cancelled ->
-- archived. This is irreversible — completed vs cancelled is no longer distinguished by status, only
-- by the completed_at / cancelled_at timestamps.
ALTER TABLE "jobs" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
ALTER TYPE "public"."job_status" RENAME TO "job_status_old";--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('active', 'archived');--> statement-breakpoint
ALTER TABLE "jobs" ALTER COLUMN "status" SET DATA TYPE "public"."job_status" USING (
	CASE "status"::text
		WHEN 'completed' THEN 'archived'
		WHEN 'cancelled' THEN 'archived'
		ELSE 'active'
	END::"public"."job_status"
);--> statement-breakpoint
ALTER TABLE "jobs" ALTER COLUMN "status" SET DEFAULT 'active';--> statement-breakpoint
DROP TYPE "public"."job_status_old";
