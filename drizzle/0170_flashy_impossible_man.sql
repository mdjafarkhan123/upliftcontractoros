ALTER TABLE "job_invoice_reminders" ADD COLUMN "source" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "job_invoice_reminders" ADD COLUMN "visit_id" uuid;--> statement-breakpoint
ALTER TABLE "job_invoice_reminders" ADD CONSTRAINT "job_invoice_reminders_visit_id_appointments_id_fk" FOREIGN KEY ("visit_id") REFERENCES "public"."appointments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_job_invoice_reminders_visit" ON "job_invoice_reminders" USING btree ("visit_id");