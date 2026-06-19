-- =========================================================================
-- SEARCH OVERHAUL — Phase 2.b (Appointments / Reviews)
-- Extends the pg_trgm fuzzy search (enabled in 0079) to the appointments
-- search box and the reputation Reviews tab. Contact name/company are already
-- indexed by 0079, so searching either list *by client name* needs no new
-- index here — only each list's own text columns do.
-- All additive. Partial to stay lean, matching 0079 / 0080.
-- =========================================================================

-- Appointments — title fuzzy/substring search (filter-only search box).
CREATE INDEX IF NOT EXISTS "idx_appointments_title_trgm"
	ON "appointments" USING gin ("title" extensions.gin_trgm_ops)
	WHERE "deleted_at" IS NULL;--> statement-breakpoint

-- Appointments — location fuzzy/substring search (e.g. searching by address).
CREATE INDEX IF NOT EXISTS "idx_appointments_location_trgm"
	ON "appointments" USING gin ("location" extensions.gin_trgm_ops)
	WHERE "deleted_at" IS NULL;--> statement-breakpoint

-- Reviews — body fuzzy/substring search. `reviews` is immutable (no deleted_at),
-- and body is nullable, so the partial predicate is on body presence.
CREATE INDEX IF NOT EXISTS "idx_reviews_body_trgm"
	ON "reviews" USING gin ("body" extensions.gin_trgm_ops)
	WHERE "body" IS NOT NULL;
