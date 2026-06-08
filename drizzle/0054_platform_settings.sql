-- Platform-wide singleton config (PO scope, no org_id) — home for the SMS
-- master-balance safety floor (Blueprint §"PO Safety Floor"). Exactly one row,
-- id='global', enforced by the CHECK constraint. The PO's real Telnyx
-- master-account balance is cached here by the sms-master-balance-sync cron; the
-- floor is the threshold below which all outbound SMS is paused platform-wide.
-- The authoritative paused state lives in BullMQ (smsQueue().isPaused()); the
-- sms_paused_at / sms_paused_reason columns are display/audit metadata only.

CREATE TABLE IF NOT EXISTS "platform_settings" (
	"id" text PRIMARY KEY DEFAULT 'global' NOT NULL,
	"sms_master_floor" numeric(12, 4) DEFAULT '0' NOT NULL,
	"sms_master_balance" numeric(12, 4),
	"sms_master_balance_at" timestamp with time zone,
	"sms_master_balance_currency" text,
	"sms_paused_at" timestamp with time zone,
	"sms_paused_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_settings_singleton" CHECK ("platform_settings"."id" = 'global')
);--> statement-breakpoint

-- Seed the single global row so reads never have to special-case an empty table.
INSERT INTO "platform_settings" ("id") VALUES ('global') ON CONFLICT ("id") DO NOTHING;
