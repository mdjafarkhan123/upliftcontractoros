ALTER TYPE "public"."appointment_status" ADD VALUE 'unscheduled' BEFORE 'completed';--> statement-breakpoint
ALTER TABLE "appointments" ALTER COLUMN "scheduled_start" DROP NOT NULL;