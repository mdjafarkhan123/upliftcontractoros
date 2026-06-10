-- Extra branded From-addresses per org (Stage 4a of the email identity plan). The
-- DEFAULT address stays organizations.email_sender_local; this table holds only the
-- additional addresses (sales@, support@) on the org's verified sending domain.
-- Adding a local-part on an already-verified domain needs no DNS → self-service.
-- Purely ADDITIVE: no backfill, the table starts empty.

CREATE TABLE IF NOT EXISTS "email_sender_addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
	"email_domain_id" uuid NOT NULL REFERENCES "email_domains"("id") ON DELETE cascade,
	"local_part" text NOT NULL,
	"label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "email_sender_addresses_org_local_uq" ON "email_sender_addresses" ("org_id", "local_part");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_sender_addresses_org_idx" ON "email_sender_addresses" ("org_id");
