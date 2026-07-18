CREATE TYPE "public"."booking_form_type" AS ENUM('booking', 'request');--> statement-breakpoint
ALTER TABLE "booking_links" ADD COLUMN "form_type" "booking_form_type" DEFAULT 'booking' NOT NULL;--> statement-breakpoint
ALTER TABLE "booking_links" ADD COLUMN "requires_approval" boolean DEFAULT true NOT NULL;