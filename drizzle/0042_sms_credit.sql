-- SMS credit system: dollar-denominated prepaid credit per org.
-- Replaces the count-based max_monthly_sms gate as the authoritative SMS money
-- guard. Money is numeric(12,4) so sub-cent Twilio pricing and PO per-SMS prices
-- are exact; all balance math runs in Postgres (never JS floats).

-- Enum for ledger entry kinds. Idempotent create.
DO $$ BEGIN
	CREATE TYPE "sms_credit_entry_type" AS ENUM ('charge', 'refund', 'manual_topup', 'monthly_grant');
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

-- One row per org: live balance + PO-configured pricing/allowance.
CREATE TABLE IF NOT EXISTS "org_sms_credit" (
	"org_id" uuid PRIMARY KEY NOT NULL,
	"balance" numeric(12, 4) DEFAULT '0' NOT NULL,
	"monthly_included_credit" numeric(12, 4) DEFAULT '5.0000' NOT NULL,
	"per_sms_cost" numeric(12, 4) DEFAULT '0.1000' NOT NULL,
	"last_monthly_grant_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "org_sms_credit_org_id_organizations_id_fk"
		FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE cascade
);--> statement-breakpoint

-- Append-only audit of every balance change. The UNIQUE idempotency_key is the
-- no-double-deduction / no-double-refund guarantee.
CREATE TABLE IF NOT EXISTS "sms_credit_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"entry_type" "sms_credit_entry_type" NOT NULL,
	"amount" numeric(12, 4) NOT NULL,
	"balance_after" numeric(12, 4) NOT NULL,
	"message_id" uuid,
	"created_by" text,
	"note" text,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sms_credit_ledger_org_id_organizations_id_fk"
		FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE cascade
);--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "sms_credit_ledger_idempotency_key_uq"
	ON "sms_credit_ledger" ("idempotency_key");--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "sms_credit_ledger_org_created_idx"
	ON "sms_credit_ledger" ("org_id", "created_at" DESC);--> statement-breakpoint

-- Per-message dollar cost charged at send time.
ALTER TABLE "messages"
	ADD COLUMN IF NOT EXISTS "sms_cost" numeric(12, 4);--> statement-breakpoint

-- Backfill: every existing org gets a credit row seeded with one month's
-- allowance so sends keep working immediately. last_monthly_grant_at = now()
-- so the monthly-grant cron does not double-grant for the current month.
-- Runs once at deploy; ON CONFLICT keeps it safe to re-run.
INSERT INTO "org_sms_credit" ("org_id", "balance", "last_monthly_grant_at")
SELECT o."id", '5.0000', now()
FROM "organizations" o
ON CONFLICT ("org_id") DO NOTHING;
