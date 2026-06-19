DROP INDEX "automation_enrollments_active_uq";--> statement-breakpoint
ALTER TABLE "automation_enrollments" ADD COLUMN "anchor_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "automation_enrollments_active_uq" ON "automation_enrollments" USING btree ("sequence_id","contact_id","resource_id") WHERE "automation_enrollments"."status" IN ('active', 'paused');