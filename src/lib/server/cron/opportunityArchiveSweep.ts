/**
 * Cron — Terminal opportunity auto-archive sweep.
 *
 * Schedule: 45 3 * * * (UTC).
 * Purpose:  Stamp archived_at on settled deals so they drop out of working
 *           queries and feed a future closed-history view. Won deals archive 7
 *           days after closing, Lost deals 30 days after (PLAN §1).
 * Idempotency:
 *   - UPDATE only matches rows where archived_at IS NULL and the closed_at age
 *     threshold is met, so re-runs are no-ops once a deal has been archived.
 * Failure behavior:
 *   - Errors bubble to runGuarded() which catches, logs, and continues.
 *
 * Note: the board already renders only status='open' deals, so archiving does
 * not change what is visible today and emits no events — pure housekeeping.
 */
import { sql } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import type { CronJobResult } from './index';

export async function runOpportunityArchiveSweep(): Promise<CronJobResult> {
	return db.transaction(async (tx) => {
		const updated = await tx.execute<{ id: string }>(sql`
			UPDATE opportunities
			SET archived_at = now(), updated_at = now()
			WHERE archived_at IS NULL
				AND deleted_at IS NULL
				AND closed_at IS NOT NULL
				AND (
					(status = 'won' AND closed_at < now() - interval '7 days')
					OR (status = 'lost' AND closed_at < now() - interval '30 days')
				)
			RETURNING id
		`);

		const rows = updated as unknown as { id: string }[];

		return {
			scanned_count: rows.length,
			affected_count: rows.length,
			processed_count: rows.length,
			skipped_count: 0,
			error_count: 0
		};
	});
}
