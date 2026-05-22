-- Quote deposit tracking columns. Drives the optional deposit flow.
-- deposit_paid_amount stored in CENTS (INTEGER); deposit_amount remains NUMERIC(12,2) in dollars.
ALTER TABLE "quotes"
  ADD COLUMN IF NOT EXISTS "deposit_paid_amount" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "deposit_paid_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "deposit_stripe_payment_intent_id" text,
  ADD COLUMN IF NOT EXISTS "deposit_applied_invoice_id" uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'quotes_deposit_applied_invoice_id_fkey'
  ) THEN
    ALTER TABLE "quotes"
      ADD CONSTRAINT "quotes_deposit_applied_invoice_id_fkey"
      FOREIGN KEY ("deposit_applied_invoice_id")
      REFERENCES "invoices"("id") ON DELETE SET NULL;
  END IF;
END$$;

-- Idempotency guard: each Stripe PaymentIntent can land on at most one quote deposit.
CREATE UNIQUE INDEX IF NOT EXISTS "idx_quotes_deposit_stripe_intent"
  ON "quotes" ("deposit_stripe_payment_intent_id")
  WHERE "deposit_stripe_payment_intent_id" IS NOT NULL;
