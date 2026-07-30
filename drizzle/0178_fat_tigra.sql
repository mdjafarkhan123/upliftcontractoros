CREATE TYPE "public"."payment_adjustment_type" AS ENUM('payment', 'refund', 'correction', 'failed_payment', 'bad_debt', 'void');--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "adjustment_type" "payment_adjustment_type" DEFAULT 'payment' NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "applies_to_payment_id" uuid;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_applies_to_payment_id_payments_id_fk" FOREIGN KEY ("applies_to_payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_payments_applies_to_payment_id" ON "payments" USING btree ("applies_to_payment_id");