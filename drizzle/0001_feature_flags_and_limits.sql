-- Feature flags, plan quotas, and integration status on organizations.
-- This migration is additive only. The live Supabase database already has
-- these columns; the migration exists so fresh installs / new environments
-- can reach the same shape.

ALTER TABLE "organizations"
  ADD COLUMN IF NOT EXISTS "feature_one_way_sms" boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "feature_two_way_sms" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "feature_bulk_sms" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "feature_conversations" boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "feature_missed_call_textback" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "feature_team_management" boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "feature_appointments" boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "feature_media_uploads" boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "feature_automation_engine" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "feature_review_funnel" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "feature_appointment_reminders" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "feature_invoice_reminders" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "feature_financial_tools" boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "feature_stripe_payments" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "feature_growth_feed" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "feature_advanced_reporting" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "feature_ai_assistant" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "feature_custom_branding" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "feature_api_access" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "feature_webhooks" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "feature_client_portal" boolean NOT NULL DEFAULT false;

ALTER TABLE "organizations"
  ADD COLUMN IF NOT EXISTS "max_team_members" integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS "max_monthly_sms" integer NOT NULL DEFAULT 500,
  ADD COLUMN IF NOT EXISTS "max_bulk_sms_per_day" integer NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS "max_ai_requests_per_month" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "max_storage_gb" integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS "max_automation_workflows" integer NOT NULL DEFAULT 0;

ALTER TABLE "organizations"
  ADD COLUMN IF NOT EXISTS "integration_status" jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS "feature_overrides_updated_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "feature_flags_updated_by" uuid REFERENCES "org_members"("id");
