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
	const result = await db.execute(sql`
		WITH actual AS (
			SELECT
				c.id AS conversation_id,
				COALESCE(COUNT(m.id) FILTER (
					WHERE m.direction = 'inbound' AND m.read_at IS NULL
				), 0)::int AS cnt
			FROM conversations c
			LEFT JOIN messages m ON m.conversation_id = c.id
			WHERE c.deleted_at IS NULL
			GROUP BY c.id
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
