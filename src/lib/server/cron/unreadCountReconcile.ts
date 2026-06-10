/**
 * Cron — Unread count drift reconciliation.
 *
 * Schedule: hourly.
 * Purpose:  Catch any drift between conversations.unread_count and the actual
 *           count of unread inbound messages. Selective self-heal on thread
 *           open + atomic mark-read CTE already handle the common cases; this
 *           is the final safety net.
 *
 * Idempotent: a WHERE clause restricts updates to rows where stored count
 * differs from actual, so reruns are no-ops once consistent.
 */
import { sql } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import type { CronJobResult } from './index';

export async function runUnreadCountReconcile(): Promise<CronJobResult> {
	// Scoped to active rows only: a drifted conversation either still claims
	// unread (unread_count <> 0) or was touched recently (any message write
	// bumps updated_at). Cold, consistent threads are skipped, turning the
	// hourly job from O(all messages) into O(active conversations). The count
	// is a per-row correlated subquery served by idx_messages_direction_read.
	const result = await db.execute(sql`
		WITH candidates AS (
			SELECT c.id
			FROM conversations c
			WHERE c.deleted_at IS NULL
				AND (c.unread_count <> 0 OR c.updated_at > NOW() - INTERVAL '2 hours')
		),
		actual AS (
			SELECT
				cand.id AS conversation_id,
				(
					SELECT COUNT(*)::int
					FROM messages m
					WHERE m.conversation_id = cand.id
						AND m.direction = 'inbound'
						AND m.read_at IS NULL
				) AS cnt
			FROM candidates cand
		)
		UPDATE conversations c
		SET unread_count = actual.cnt,
			updated_at = NOW()
		FROM actual
		WHERE c.id = actual.conversation_id
			AND c.unread_count <> actual.cnt
		RETURNING c.id
	`);

	const rows =
		(result as unknown as { rows?: unknown[] }).rows ??
		(Array.isArray(result) ? (result as unknown[]) : []);

	return {
		processed_count: rows.length,
		affected_count: rows.length
	};
}
