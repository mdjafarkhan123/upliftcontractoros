ALTER TABLE "payments" ADD COLUMN "stripe_refund_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_payments_stripe_refund_id" ON "payments" USING btree ("stripe_refund_id");