ALTER TABLE "invoices" ADD COLUMN "late_fee_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "late_fee_type" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "late_fee_value" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "late_fee_grace_days" integer DEFAULT 3 NOT NULL;