-- Persist the Stripe Payment Link ID alongside its URL.
-- The URL is what we deliver to customers in outbound email/SMS as a
-- redundant payment fallback (in addition to the canonical /i/[token] link).
-- The ID (plink_...) is required for stripe.paymentLinks.update(id, { active: false })
-- when the invoice is paid, so we can deactivate the static link and prevent
-- duplicate charges via the fallback path after settlement.

ALTER TABLE "invoices"
  ADD COLUMN IF NOT EXISTS "stripe_payment_link_id" text;
