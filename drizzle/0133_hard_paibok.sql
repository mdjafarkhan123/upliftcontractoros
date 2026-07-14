ALTER TYPE "public"."media_purpose_tag" ADD VALUE 'job_visit_photo';--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "completion_notes" text;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "completed_by" uuid;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_completed_by_org_members_id_fk" FOREIGN KEY ("completed_by") REFERENCES "public"."org_members"("id") ON DELETE no action ON UPDATE no action;