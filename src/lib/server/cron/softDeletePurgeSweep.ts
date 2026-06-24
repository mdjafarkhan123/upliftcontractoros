/**
 * Cron — Recycle-bin purge for soft-deleted records across the app.
 *
 * Schedule: daily at 03:45 UTC (after contact-purge-sweep at 03:15).
 * Purpose:  Permanently remove records that have sat soft-deleted longer than the
 *           retention window, so "deleted" data does not accumulate forever.
 * Retention: 90 days — long enough to recover a mistaken delete, short enough to
 *           honor data-retention expectations (GDPR/CCPA). Matches the bumped
 *           contact purge window.
 * Coverage: invoices (no payments), quotes (no deposit), quote templates,
 *           appointments, jobs, opportunities, conversations, contact
 *           notes/addresses. Money records and anything still linked to a live
 *           record are skipped by the FK wall (see maintenance/softDeletePurge).
 * Failure behavior: runGuarded() in cron/index.ts isolates errors; per-entity
 *           failures are already swallowed inside the engine so one bad table
 *           never blocks the rest.
 */
import { purgeSoftDeletedOlderThan } from '$lib/server/maintenance/softDeletePurge';
import type { CronJobResult } from './index';

const RETENTION_DAYS = 90;

export async function runSoftDeletePurgeSweep(): Promise<CronJobResult> {
	const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
	const { scanned, purged, blocked } = await purgeSoftDeletedOlderThan(cutoff);

	return {
		scanned_count: scanned,
		affected_count: purged,
		processed_count: purged,
		skipped_count: blocked,
		error_count: 0
	};
}
