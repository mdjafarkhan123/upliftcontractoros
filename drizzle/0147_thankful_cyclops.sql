ALTER TABLE "invoices" ADD COLUMN "discount_type" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "discount_value" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "discount_amount" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "discount_label" varchar(60);--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "terms" text;