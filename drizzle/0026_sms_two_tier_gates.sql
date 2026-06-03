-- Two-tier SMS permission system: jafar layer (master gates on organizations)
-- + contractor layer (per-channel toggles on automation_settings).
--
-- Adds (1) capability flags that close gaps where contractor toggles existed
-- with no jafar-side gate, (2) SMS-channel allowances for automations that
-- have or may have an email channel, and (3) contractor-side SMS toggle +
-- message for payment receipts (first automation to ship the dual-channel
-- pattern; others will follow in their own migrations).
--
-- All new flags default false so existing orgs see no behavior change until
-- plan templates are re-applied from /jafar.

ALTER TABLE "organizations"
	ADD COLUMN "feature_payment_receipt" boolean NOT NULL DEFAULT false,
	ADD COLUMN "feature_quote_followup" boolean NOT NULL DEFAULT false,
	ADD COLUMN "feature_speed_to_lead" boolean NOT NULL DEFAULT false,
	ADD COLUMN "payment_receipt_sms_allowed" boolean NOT NULL DEFAULT false,
	ADD COLUMN "quote_followup_sms_allowed" boolean NOT NULL DEFAULT false,
	ADD COLUMN "appointment_reminder_sms_allowed" boolean NOT NULL DEFAULT false,
	ADD COLUMN "invoice_reminder_sms_allowed" boolean NOT NULL DEFAULT false,
	ADD COLUMN "review_funnel_sms_allowed" boolean NOT NULL DEFAULT false;
--> statement-breakpoint

ALTER TABLE "automation_settings"
	ADD COLUMN "payment_receipt_sms_enabled" boolean NOT NULL DEFAULT false,
	ADD COLUMN "payment_receipt_sms_message" text NOT NULL
		DEFAULT 'Hi {contact_name}, thanks for your payment of {amount} to {org_name}. Reply STOP to opt out.';
