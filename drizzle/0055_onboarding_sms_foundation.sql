-- Onboarding + SMS activation foundation (Step 1).
-- Source: Blueprint.md §10 + Onboarding.md. Purely ADDITIVE — a new org_status value,
-- a new sms_approval_status enum, and five nullable/defaulted columns on organizations.
-- No behavior change: the onboarding gate, provisioning, and outbound gating are wired
-- in later steps. 'pending_setup' is added but never used in this migration, so the
-- ADD VALUE is safe inside drizzle's per-migration transaction (Postgres 12+).

ALTER TYPE "org_status" ADD VALUE IF NOT EXISTS 'pending_setup';
--> statement-breakpoint

DO $$ BEGIN
	CREATE TYPE "sms_approval_status" AS ENUM ('not_required', 'pending', 'approved', 'rejected');
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

-- Master SMS switch (PO-controlled). Existing orgs default true so nothing breaks.
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "sms_enabled" boolean DEFAULT true NOT NULL;
--> statement-breakpoint

-- ISO 3166-1 alpha-2 country code, collected in onboarding Step 2.
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "country" text;
--> statement-breakpoint

-- Carrier registration state for outbound SMS (10DLC / CWTA).
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "sms_approval_status" "sms_approval_status" DEFAULT 'not_required' NOT NULL;
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "sms_approval_submitted_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "sms_approval_external_id" text;
