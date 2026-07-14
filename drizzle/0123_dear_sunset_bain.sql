ALTER TABLE "appointments" ADD COLUMN "billed_invoice_id" uuid;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "billing_type" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "invoice_frequency" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "fixed_invoice_amount" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_billed_invoice_id_invoices_id_fk" FOREIGN KEY ("billed_invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;