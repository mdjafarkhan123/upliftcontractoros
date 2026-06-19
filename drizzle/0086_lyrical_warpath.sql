ALTER TYPE "public"."call_outcome" ADD VALUE 'wrong_number';--> statement-breakpoint
ALTER TABLE "automation_settings" ADD COLUMN "auto_create_opp_on_lead" boolean DEFAULT true NOT NULL;