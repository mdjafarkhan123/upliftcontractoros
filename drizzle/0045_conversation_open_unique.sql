-- Close any pre-existing duplicate OPEN conversations per (org_id, contact_id),
-- keeping the most recent, so the partial unique index below can be created.
-- Nothing is deleted; older duplicate open threads are flipped to closed.
WITH ranked AS (
	SELECT id,
		row_number() OVER (
			PARTITION BY org_id, contact_id
			ORDER BY last_message_at DESC NULLS LAST, created_at DESC, id DESC
		) AS rn
	FROM conversations
	WHERE status = 'open' AND deleted_at IS NULL
)
UPDATE conversations c
SET status = 'closed',
	closed_at = now(),
	closed_reason = 'dedup_merge',
	updated_at = now()
FROM ranked r
WHERE c.id = r.id AND r.rn > 1;
--> statement-breakpoint
-- Enforce one open conversation per contact going forward. The
-- findOrCreateOpenConversation helper relies on this for race safety.
CREATE UNIQUE INDEX IF NOT EXISTS "idx_conversations_open_contact"
	ON "conversations" ("org_id", "contact_id")
	WHERE "status" = 'open' AND "deleted_at" IS NULL;
