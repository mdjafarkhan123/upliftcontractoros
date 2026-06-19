ALTER TYPE "public"."pipeline_lost_reason" ADD VALUE 'scope' BEFORE 'other';--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "decline_reason" "pipeline_lost_reason";--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "decline_reason_note" text;