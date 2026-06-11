-- Contact P2 gaps: company/business name + lead temperature.
--
-- 1. lead_temperature enum (hot|warm|cold) — sales-priority signal distinct from
--    lifecycle `status`. Nullable column = not yet triaged. Lets the team sort and
--    filter the follow-up queue by how warm a lead is.
-- 2. company_name column — businesses (property managers, HOAs, investors) are not
--    individuals; `full_name` stays the person, `company_name` the organization.

DO $$ BEGIN
  CREATE TYPE "lead_temperature" AS ENUM('hot', 'warm', 'cold');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

ALTER TABLE "contacts"
  ADD COLUMN IF NOT EXISTS "company_name" text;--> statement-breakpoint

ALTER TABLE "contacts"
  ADD COLUMN IF NOT EXISTS "lead_temperature" "lead_temperature";
