-- Referral tracking: allow a contact to record which other contact referred them.
-- Self-referencing FK on contacts table. Nullable — most contacts have no referrer.

ALTER TABLE "contacts"
  ADD COLUMN IF NOT EXISTS "referred_by_contact_id" uuid REFERENCES "contacts"("id");--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_contacts_referred_by"
  ON "contacts" ("referred_by_contact_id") WHERE "referred_by_contact_id" IS NOT NULL;
