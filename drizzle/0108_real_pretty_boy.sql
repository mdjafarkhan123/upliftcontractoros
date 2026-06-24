ALTER TABLE "quote_line_items" ADD COLUMN "is_optional" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "quote_line_items" ADD COLUMN "accepted_selected" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "quote_template_line_items" ADD COLUMN "is_optional" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "accepted_subtotal" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "accepted_tax_amount" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "accepted_total" numeric(12, 2);