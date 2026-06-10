-- Performance audit Phase 1 (PERFORMANCE_PLAN.md 1.3) — hot-path composite indexes.
-- All additive; write amplification is one tiny index entry per affected insert.

-- 1. Contacts list: keyset pagination ORDER BY created_at DESC, id DESC per org,
--    always filtered to non-deleted rows.
CREATE INDEX IF NOT EXISTS "idx_contacts_org_created"
	ON "contacts" ("org_id", "created_at" DESC, "id" DESC)
	WHERE "deleted_at" IS NULL;--> statement-breakpoint

-- 2. Dashboard revenue: payments aggregated per org over paid_at windows.
CREATE INDEX IF NOT EXISTS "idx_payments_org_paid_at"
	ON "payments" ("org_id", "paid_at" DESC);--> statement-breakpoint

-- 3. Dashboard jobs-won: closed opportunities per org over closed_at windows.
CREATE INDEX IF NOT EXISTS "idx_opportunities_org_closed_at"
	ON "opportunities" ("org_id", "closed_at" DESC)
	WHERE "closed_at" IS NOT NULL AND "deleted_at" IS NULL;--> statement-breakpoint

-- 4. Inbox has_delivery_failure EXISTS probe — runs once per conversation row
--    (30×/page on /api/conversations, plus conversation detail). Partial index
--    makes it an O(1) lookup; stays near-empty since failures are rare.
CREATE INDEX IF NOT EXISTS "idx_messages_delivery_failure"
	ON "messages" ("conversation_id")
	WHERE "direction" = 'outbound'
		AND "is_internal_note" = false
		AND "status" IN ('failed', 'bounced', 'undeliverable');
