-- Custom SQL migration file, put your code below! --

-- Drop two orphaned objects that existed in the database but were never tracked in
-- the Drizzle schema or any migration (leftovers from earlier direct-in-Supabase
-- edits during the email feature build). Both are dead: `org_email_settings` was
-- superseded by email_domains / email_sender_addresses (0 rows), and the
-- feature_email_conversations flag is referenced nowhere in the codebase.
DROP TABLE IF EXISTS "org_email_settings";--> statement-breakpoint
ALTER TABLE "organizations" DROP COLUMN IF EXISTS "feature_email_conversations";
