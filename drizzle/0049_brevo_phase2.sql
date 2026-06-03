-- Brevo Phase 2 — switch live email send/receive to Brevo.
-- Adds the dedicated receiving subdomain (Brevo refuses to parse inbound mail on
-- the sending domain) and tracks the per-org inbound parse webhook id.

ALTER TABLE "email_domains"
	ADD COLUMN IF NOT EXISTS "inbound_domain" text;--> statement-breakpoint

ALTER TABLE "email_domains"
	ADD COLUMN IF NOT EXISTS "brevo_inbound_webhook_id" text;--> statement-breakpoint

-- Backfill the receiving subdomain for any pre-existing rows (Phase 1 tenants).
UPDATE "email_domains"
	SET "inbound_domain" = 'inbound.' || "domain"
	WHERE "inbound_domain" IS NULL;--> statement-breakpoint

-- Inbound routing key. NULLs remain distinct, so rows created before backfill
-- runs are unaffected; every row carries a value after the UPDATE above.
CREATE UNIQUE INDEX IF NOT EXISTS "email_domains_inbound_domain_uq"
	ON "email_domains" ("inbound_domain");
