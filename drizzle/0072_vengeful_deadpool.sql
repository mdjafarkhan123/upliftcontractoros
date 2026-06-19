ALTER TABLE "opportunities" ADD COLUMN "stale_nudged_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pipeline_stages" ADD COLUMN "default_follow_up_days" integer;