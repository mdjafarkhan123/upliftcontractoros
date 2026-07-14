ALTER TABLE "invoice_line_items" ADD COLUMN "unit" varchar(50);--> statement-breakpoint
ALTER TABLE "invoice_line_items" ADD COLUMN "unit_cost" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "invoice_line_items" ADD COLUMN "source_catalog_item_id" uuid;--> statement-breakpoint
ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_source_catalog_item_id_catalog_items_id_fk" FOREIGN KEY ("source_catalog_item_id") REFERENCES "public"."catalog_items"("id") ON DELETE set null ON UPDATE no action;