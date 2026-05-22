-- Stripe account metadata captured at connect time so the contractor can
-- recognize which Stripe account is wired up (business name + support email)
-- and which mode (test vs live). Sourced from stripe.accounts.retrieve(), not
-- key prefix parsing — the Stripe API response is authoritative.

ALTER TABLE "organizations"
  ADD COLUMN IF NOT EXISTS "stripe_account_name" text,
  ADD COLUMN IF NOT EXISTS "stripe_account_email" text,
  ADD COLUMN IF NOT EXISTS "stripe_livemode" boolean,
  ADD COLUMN IF NOT EXISTS "stripe_last_verified_at" timestamp with time zone;
