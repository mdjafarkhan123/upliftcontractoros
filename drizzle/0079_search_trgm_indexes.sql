-- =========================================================================
-- SEARCH OVERHAUL — Phase 1 foundation
-- Trigram (pg_trgm) fuzzy search: typo tolerance + indexed substring/ILIKE.
-- All additive. Indexes are partial (active rows only) to stay lean; the
-- recycle-bin view that searches soft-deleted rows is rare and may seq-scan.
-- =========================================================================

-- Trigram extension lives in Supabase's `extensions` schema (same as pgcrypto /
-- uuid-ossp). The `postgres` role search_path already includes `extensions`, so
-- the `%` similarity operator and similarity()/gin_trgm_ops resolve unqualified
-- at query time; the index opclass below is schema-qualified to be explicit.
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;--> statement-breakpoint

-- Contacts — accelerates `col ILIKE '%term%'` (substring) AND `col % term`
-- (trigram typo match) for the contact list + every contact typeahead/picker.
CREATE INDEX IF NOT EXISTS "idx_contacts_full_name_trgm"
	ON "contacts" USING gin ("full_name" extensions.gin_trgm_ops)
	WHERE "deleted_at" IS NULL;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_contacts_company_name_trgm"
	ON "contacts" USING gin ("company_name" extensions.gin_trgm_ops)
	WHERE "deleted_at" IS NULL;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_contacts_email_trgm"
	ON "contacts" USING gin ("email" extensions.gin_trgm_ops)
	WHERE "deleted_at" IS NULL;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_contacts_phone_trgm"
	ON "contacts" USING gin ("phone" extensions.gin_trgm_ops)
	WHERE "deleted_at" IS NULL;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_contacts_alt_phone_trgm"
	ON "contacts" USING gin ("alt_phone" extensions.gin_trgm_ops)
	WHERE "deleted_at" IS NULL;
