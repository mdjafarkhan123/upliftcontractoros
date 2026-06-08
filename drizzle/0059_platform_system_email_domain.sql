-- Platform system email sending domain (PO-managed in /jafar). Outbound-only mirror
-- of the per-org email_domains flow, but a SINGLETON — so the columns live on the
-- platform_settings singleton rather than a per-row table. Purely ADDITIVE.
-- Reuses the existing "email_domain_status" enum (created in 0048_email_domains).
-- systemFromAddress() reads system_email_domain when status='verified', else falls
-- back to the SYSTEM_FROM_EMAIL env value.

-- Source-of-truth inputs typed by the PO; system_email_domain is derived as
-- `${sending_prefix}.${root_domain}` (e.g. notifications.upliftcontractor.com).
ALTER TABLE "platform_settings" ADD COLUMN IF NOT EXISTS "system_email_root_domain" text;
--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN IF NOT EXISTS "system_email_sending_prefix" text;
--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN IF NOT EXISTS "system_email_domain" text;
--> statement-breakpoint

-- From identity: `"${from_name}" <${from_local}@${domain}>`.
ALTER TABLE "platform_settings" ADD COLUMN IF NOT EXISTS "system_email_from_local" text NOT NULL DEFAULT 'noreply';
--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN IF NOT EXISTS "system_email_from_name" text NOT NULL DEFAULT 'Uplift Contractor';
--> statement-breakpoint

-- Brevo's returned domain id.
ALTER TABLE "platform_settings" ADD COLUMN IF NOT EXISTS "system_email_brevo_domain_id" text;
--> statement-breakpoint

-- Null until the PO registers a domain. Reuses the per-org email_domain_status enum.
ALTER TABLE "platform_settings" ADD COLUMN IF NOT EXISTS "system_email_status" "email_domain_status";
--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN IF NOT EXISTS "system_email_brevo_verified" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN IF NOT EXISTS "system_email_brevo_authenticated" boolean NOT NULL DEFAULT false;
--> statement-breakpoint

-- DKIM + brevo-code + DMARC rows (sending-only; no inbound MX) for the panel.
ALTER TABLE "platform_settings" ADD COLUMN IF NOT EXISTS "system_email_dns_records" jsonb;
--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN IF NOT EXISTS "system_email_last_checked_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN IF NOT EXISTS "system_email_verified_at" timestamp with time zone;
