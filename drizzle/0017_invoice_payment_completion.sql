-- Invoice payment completion — Phase 3 of the revenue surface.
-- Adds public customer-facing invoice access (stable raw token), view tracking,
-- payment receipt instrumentation, 1h appointment reminder split, and the
-- conversion uniqueness guard for quote → invoice.

-- Invoices: stable raw public token + first-view timestamp.
-- Raw token (not hash) so the customer-facing URL remains reconstructible
-- for outbound communication flows after the invoice is created.
ALTER TABLE "invoices"
  ADD COLUMN IF NOT EXISTS "public_token" text,
  ADD COLUMN IF NOT EXISTS "viewed_at" timestamp with time zone;

CREATE UNIQUE INDEX IF NOT EXISTS "idx_invoices_public_token"
  ON "invoices" ("public_token")
  WHERE "public_token" IS NOT NULL;

-- Retire the obsolete hash-only approach. The raw public_token is now the
-- canonical customer-facing identifier; carrying both columns long-term would
-- create schema drift. Safe to drop because no production-issued invoice URLs
-- depend on the hash form (this is shipping alongside the public pay surface).
DROP INDEX IF EXISTS "invoices_public_token_hash_unique";
DROP INDEX IF EXISTS "invoices_public_token_hash_key";
ALTER TABLE "invoices" DROP COLUMN IF EXISTS "public_token_hash";

-- One non-cancelled invoice per source quote — backs convert-to-invoice idempotency.
CREATE UNIQUE INDEX IF NOT EXISTS "idx_invoices_quote_conversion"
  ON "invoices" ("quote_id")
  WHERE "quote_id" IS NOT NULL
    AND "deleted_at" IS NULL
    AND "status" != 'cancelled';

-- Append-only customer view log. Mirrors quote_views.
-- First qualifying view per invoice emits invoice.viewed via the outbox.
CREATE TABLE IF NOT EXISTS "invoice_views" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "invoice_id" uuid NOT NULL REFERENCES "invoices"("id"),
  "ip_hash" text,
  "user_agent_hash" text,
  "viewed_at" timestamp with time zone NOT NULL DEFAULT now(),
  "notification_sent" boolean NOT NULL DEFAULT false,
  "notification_sent_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_invoice_views_invoice_id_viewed_at"
  ON "invoice_views" ("invoice_id", "viewed_at");
CREATE INDEX IF NOT EXISTS "idx_invoice_views_org_id"
  ON "invoice_views" ("org_id");

-- Payments: receipt delivery audit. Transactional, not promotional.
ALTER TABLE "payments"
  ADD COLUMN IF NOT EXISTS "receipt_sent_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "receipt_sent_via" text;

-- Automation settings: split 1h reminder, plus payment receipt opt-in.
-- Defaults NOT NULL with empty string for message text; settings UI guards
-- against empty values when the corresponding toggle is enabled.
ALTER TABLE "automation_settings"
  ADD COLUMN IF NOT EXISTS "appointment_reminder_1h_enabled" boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "appointment_reminder_1h_message" text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "payment_receipt_enabled" boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "payment_receipt_message" text NOT NULL DEFAULT '';

-- Seed reasonable defaults for existing rows that landed via the column default ''.
UPDATE "automation_settings"
   SET "appointment_reminder_1h_message" = 'Reminder: your appointment with {{org_name}} is in 1 hour. Reply HELP for help.'
 WHERE "appointment_reminder_1h_message" = '';

UPDATE "automation_settings"
   SET "payment_receipt_message" = 'Thanks! Payment of {{amount}} received for {{invoice_number}}. Balance: {{balance_due}}.'
 WHERE "payment_receipt_message" = '';
