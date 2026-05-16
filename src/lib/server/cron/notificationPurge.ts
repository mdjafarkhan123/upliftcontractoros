/**
 * Cron 3 — Notification purge.
 *
 * Schedule: 0 3 * * * (UTC).
 * Purpose:  Hard-delete notifications older than 90 days regardless of read
 *           status. notifications is an append-only table with no soft delete.
 * Idempotency: Re-runs delete nothing once caught up; safe to repeat.
 * Batching:   Deletes in 1,000-row chunks via CTE so we never load large
 *             rowsets into memory.
 * Failure behavior: runGuarded() catches and logs.
 */
import { sql } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import type { CronJobResult } from './index';

const BATCH_SIZE = 1000;
const MAX_BATCHES = 1000;

export async function runNotificationPurge(): Promise<CronJobResult> {
	let totalDeleted = 0;
	let batches = 0;

	while (batches < MAX_BATCHES) {
		const result = await db.execute<{ id: string }>(sql`
			DELETE FROM notifications
			WHERE id IN (
				SELECT id FROM notifications
				WHERE created_at < now() - INTERVAL '90 days'
				LIMIT ${BATCH_SIZE}
			)
			RETURNING id
		`);
		const rows = result as unknown as { id: string }[];
		const deleted = rows.length;
		totalDeleted += deleted;
		batches += 1;
		if (deleted < BATCH_SIZE) break;
	}

	return {
		scanned_count: totalDeleted,
		affected_count: totalDeleted,
		processed_count: totalDeleted,
		skipped_count: 0,
		error_count: 0
	};
}
