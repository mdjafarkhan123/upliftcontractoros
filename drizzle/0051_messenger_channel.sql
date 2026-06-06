-- Messenger channel — Stage 1 schema.
-- Adds the `messenger` message channel, makes contacts.phone nullable (a PSID-only
-- Messenger contact has no phone), adds the org feature gate, the per-org Facebook
-- Page link table, the PSID identity table, and an inbound-dedup index on messages.
-- Tenant isolation is enforced at the API/service-role layer (matches existing
-- migration convention — RLS is not managed in these files).

-- 1. New channel value on the existing enum. Additive; safe. Not USED in this tx,
--    so it is valid inside the migration transaction (PG12+).
ALTER TYPE "message_channel" ADD VALUE IF NOT EXISTS 'messenger';--> statement-breakpoint

-- 2. Phone becomes optional. It remains the dedup key (UNIQUE(org_id, phone)) only
--    when present. No data loss — existing rows already have a phone.
ALTER TABLE "contacts" ALTER COLUMN "phone" DROP NOT NULL;--> statement-breakpoint

-- 3. Org-level feature gate. Default false; flipped on per-org after Meta App Review.
ALTER TABLE "organizations"
	ADD COLUMN IF NOT EXISTS "feature_messenger" boolean DEFAULT false NOT NULL;--> statement-breakpoint

-- 4. Messenger `mid` for inbound webhook-retry dedup (mirrors twilio_message_sid).
ALTER TABLE "messages"
	ADD COLUMN IF NOT EXISTS "messenger_mid" text;--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "idx_messages_messenger_mid"
	ON "messages" ("messenger_mid")
	WHERE "messenger_mid" IS NOT NULL;--> statement-breakpoint

-- 5. Integration connection lifecycle enum.
DO $$ BEGIN
	CREATE TYPE "messenger_integration_status" AS ENUM ('connected', 'disconnected', 'error');
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

-- 6. Per-org Facebook Page link. One page per org; page_id is the inbound routing key.
CREATE TABLE IF NOT EXISTS "messenger_integrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"page_id" text NOT NULL,
	"page_name" text,
	"page_access_token" text NOT NULL,
	"token_expires_at" timestamp with time zone,
	"status" "messenger_integration_status" DEFAULT 'connected' NOT NULL,
	"subscribed" boolean DEFAULT false NOT NULL,
	"connected_by" uuid,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messenger_integrations_org_id_organizations_id_fk"
		FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE cascade,
	CONSTRAINT "messenger_integrations_connected_by_org_members_id_fk"
		FOREIGN KEY ("connected_by") REFERENCES "org_members"("id")
);--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "messenger_integrations_org_id_uq"
	ON "messenger_integrations" ("org_id");--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "messenger_integrations_page_id_uq"
	ON "messenger_integrations" ("page_id");--> statement-breakpoint

-- 7. PSID identity store. PSID is page-scoped → keyed by (org_id, page_id, psid).
CREATE TABLE IF NOT EXISTS "messenger_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"page_id" text NOT NULL,
	"psid" text NOT NULL,
	"contact_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messenger_contacts_org_id_organizations_id_fk"
		FOREIGN KEY ("org_id") REFERENCES "organizations"("id"),
	CONSTRAINT "messenger_contacts_contact_id_contacts_id_fk"
		FOREIGN KEY ("contact_id") REFERENCES "contacts"("id")
);--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "messenger_contacts_identity_uq"
	ON "messenger_contacts" ("org_id", "page_id", "psid");
