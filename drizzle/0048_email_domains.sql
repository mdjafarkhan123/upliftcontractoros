-- Per-tenant email domain onboarding (Brevo) — Phase 1 foundation.
-- One row per org. PO-operated via /jafar. The inbound_webhook_token is minted now
-- and used by the Phase 2 inbound handler at /webhooks/brevo/inbound/{token}/{domain}.

-- Status of the domain's outbound authentication with Brevo.
-- pending → created, DNS not confirmed; verifying → Verify clicked, awaiting Brevo;
-- verified → verified + authenticated; failed → verify ran, still not verified.
DO $$ BEGIN
	CREATE TYPE "email_domain_status" AS ENUM ('pending', 'verifying', 'verified', 'failed');
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "email_domains" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"domain" text NOT NULL,
	"brevo_domain_id" text,
	"inbound_webhook_token" text NOT NULL,
	"status" "email_domain_status" DEFAULT 'pending' NOT NULL,
	"brevo_verified" boolean DEFAULT false NOT NULL,
	"brevo_authenticated" boolean DEFAULT false NOT NULL,
	"dns_records" jsonb,
	"last_checked_at" timestamp with time zone,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_domains_org_id_organizations_id_fk"
		FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE cascade
);--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "email_domains_org_id_uq"
	ON "email_domains" ("org_id");--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "email_domains_domain_uq"
	ON "email_domains" ("domain");--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "email_domains_inbound_webhook_token_uq"
	ON "email_domains" ("inbound_webhook_token");
