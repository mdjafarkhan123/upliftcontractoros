ALTER TYPE "public"."lead_source_type" ADD VALUE IF NOT EXISTS 'inbound_email';--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "won_trigger" "won_trigger" DEFAULT 'quote_acceptance' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "ghost_lead_days" integer DEFAULT 14 NOT NULL;