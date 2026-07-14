ALTER TABLE "invoice_line_items" ADD COLUMN "is_late_fee" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "late_fee_total" numeric(12, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "late_fee_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "late_fee_type" text DEFAULT 'percent' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "late_fee_flat_amount" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "late_fee_percent" numeric(5, 2);