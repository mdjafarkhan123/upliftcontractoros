-- =========================================================================
-- SEARCH OVERHAUL — Phase 3.a (Global ⌘K omni-search)
-- The cross-entity /api/search endpoint reuses the shared textMatch/textRank
-- helper across every major record type. Contacts (0079), jobs/quotes/invoices
-- titles (0080) and appointments title (0081) are already trigram-indexed.
-- Pipeline opportunities were never made searchable, so the one gap the global
-- search opens up is `opportunities.title` — index it here.
-- Additive + partial (active rows only) to stay lean, matching 0079–0081.
-- =========================================================================

-- Opportunities — title fuzzy/substring search for the global palette. Backs
-- both `title ILIKE '%term%'` (substring) and `title % term` (trigram typo).
CREATE INDEX IF NOT EXISTS "idx_opportunities_title_trgm"
	ON "opportunities" USING gin ("title" extensions.gin_trgm_ops)
	WHERE "deleted_at" IS NULL;
