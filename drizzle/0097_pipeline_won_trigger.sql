CREATE TYPE "public"."won_trigger" AS ENUM('quote_acceptance', 'deposit_paid');--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "won_trigger" "won_trigger" DEFAULT 'quote_acceptance' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "ghost_lead_days" integer DEFAULT 14 NOT NULL;