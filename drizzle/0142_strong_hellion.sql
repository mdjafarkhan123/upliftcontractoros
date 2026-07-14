ALTER TABLE "catalog_items" ADD COLUMN "default_taxable" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice_line_items" ADD COLUMN "taxable" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "quote_line_items" ADD COLUMN "taxable" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "quote_template_line_items" ADD COLUMN "taxable" boolean DEFAULT true NOT NULL;