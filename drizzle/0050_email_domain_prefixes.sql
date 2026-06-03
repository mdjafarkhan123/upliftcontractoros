-- Email domain prefixes — store root + sending/inbound prefixes as the source of
-- truth and derive both full domains as SIBLINGS under the root (no nesting).
-- Fixes the inbound double-nesting bug (inbound.contact.example.com).
--
-- Dev/fake data only: existing rows are cleared so each org re-runs setup cleanly.
-- Clearing first lets us add the NOT NULL columns without a backfill default and
-- promote inbound_domain to NOT NULL.

DELETE FROM "email_domains";--> statement-breakpoint

ALTER TABLE "email_domains"
	ADD COLUMN "root_domain" text NOT NULL;--> statement-breakpoint

ALTER TABLE "email_domains"
	ADD COLUMN "sending_prefix" text NOT NULL;--> statement-breakpoint

ALTER TABLE "email_domains"
	ADD COLUMN "inbound_prefix" text NOT NULL;--> statement-breakpoint

-- inbound_domain is now always derived + stored on insert, so it is mandatory.
ALTER TABLE "email_domains"
	ALTER COLUMN "inbound_domain" SET NOT NULL;
