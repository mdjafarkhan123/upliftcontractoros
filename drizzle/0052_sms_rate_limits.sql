-- Per-org outbound SMS rate limits (Blueprint §"Rate Limiting").
-- PO-controlled via /jafar. Defaults apply to every org; the PO can override per
-- org. A send that hits either cap is deferred (re-queued by the SMS worker),
-- never dropped. The platform-wide global/minute cap stays env-based
-- (SMS_RATE_GLOBAL_PER_MIN) since it spans all orgs, not a single one.

ALTER TABLE "org_sms_credit"
	ADD COLUMN IF NOT EXISTS "sms_rate_per_min" integer DEFAULT 30 NOT NULL;--> statement-breakpoint

ALTER TABLE "org_sms_credit"
	ADD COLUMN IF NOT EXISTS "sms_rate_per_day" integer DEFAULT 1000 NOT NULL;
