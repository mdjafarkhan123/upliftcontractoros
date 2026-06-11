/**
 * Cron — Recycle-bin purge for soft-deleted contacts.
 *
 * Schedule: daily at 03:15 UTC.
 * Purpose:  Permanently remove contacts that have sat in the recycle bin
 *           (soft-deleted) longer than the retention window, freeing their
 *           reserved phone number for re-use.
 * Retention: 30 days — long enough to undo a mistaken delete, short enough to
 *           honor the deletion intent. Sits between Salesforce (15d) and
 *           HubSpot (90d).
 * Safety:
 *   - Only contacts with NO linked records are hard-deleted. Any contact that
 *     still has opportunities, jobs, quotes, invoices, conversations,
 *     appointments, reviews, media, messenger or webchat rows is rejected by
 *     the FK constraint inside hardPurgeContact(), counted as `blocked`, and
 *     left in its org's bin. Financial and communication history is never
 *     destroyed by this sweep.
 *   - Bounded to 500 contacts per run.
 * Failure behavior:
 *   - Errors are caught by runGuarded() in cron/index.ts; the worker keeps
 *     running other jobs.
 */
import { purgeDeletedContactsOlderThan } from '$lib/server/contacts/contactRepo';
import type { CronJobResult } from './index';

const RETENTION_DAYS = 30;

export async function runContactPurgeSweep(): Promise<CronJobResult> {
	const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
	const { scanned, purged, blocked } = await purgeDeletedContactsOlderThan(cutoff);

	return {
		scanned_count: scanned,
		affected_count: purged,
		processed_count: purged,
		skipped_count: blocked,
		error_count: 0
	};
}
