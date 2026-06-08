-- SMS quiet hours (Blueprint §10 / Onboarding.md Part 10). Outbound SMS is held
-- during this window, evaluated in the org's own timezone, and deferred (never
-- dropped) until the window opens. TCPA-safe defaults: block 9 PM → 8 AM local.
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "quiet_hours_enabled" boolean NOT NULL DEFAULT true;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "quiet_hours_start_hour" integer NOT NULL DEFAULT 21;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "quiet_hours_end_hour" integer NOT NULL DEFAULT 8;
