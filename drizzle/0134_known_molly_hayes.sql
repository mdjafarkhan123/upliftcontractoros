ALTER TYPE "public"."media_purpose_tag" ADD VALUE 'job_signoff_signature';--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "signoff_signature_name" varchar(120);--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "signoff_signed_at" timestamp with time zone;