-- =========================================================================
-- SEARCH OVERHAUL — Phase 2.a (Jobs / Quotes / Invoices)
-- Extends the pg_trgm fuzzy search (enabled in 0079) to the three keyset-
-- paginated list endpoints. Contact name/company are already indexed by 0079,
-- so searching these lists *by client name* needs no new index here — only the
-- list's own title column does.
-- All additive. Partial (active rows only) to stay lean, matching 0079.
-- =========================================================================

-- Jobs — accelerates `jobs.title ILIKE '%term%'` (substring) AND `title % term`
-- (trigram typo match) for the Jobs list search box.
CREATE INDEX IF NOT EXISTS "idx_jobs_title_trgm"
	ON "jobs" USING gin ("title" extensions.gin_trgm_ops)
	WHERE "deleted_at" IS NULL;--> statement-breakpoint

-- Quotes — title fuzzy/substring search. The quote_number lookup is an exact /
-- prefix text-cast match handled in the query (no trigram index needed for it).
CREATE INDEX IF NOT EXISTS "idx_quotes_title_trgm"
	ON "quotes" USING gin ("title" extensions.gin_trgm_ops)
	WHERE "deleted_at" IS NULL;--> statement-breakpoint

-- Invoices — title fuzzy/substring search. invoice_number handled like quotes.
CREATE INDEX IF NOT EXISTS "idx_invoices_title_trgm"
	ON "invoices" USING gin ("title" extensions.gin_trgm_ops)
	WHERE "deleted_at" IS NULL;
