/**
 * Cron 4 — Org lifecycle advancement.
 *
 * Schedule: 0 1 * * * (UTC).
 * Purpose:  Advance suspended orgs toward deletion.
 *           - suspended >= 90 days → pending_deletion + schedule deletion +7d
 *           - pending_deletion past scheduled time → deleteOrg() cascade
 * Idempotency:
 *   - Transitions are monotonic (active→suspended→pending_deletion→deleted).
 *     Status filters prevent reverse moves. Deleted orgs cannot match again
 *     because their row is gone.
 * Failure behavior:
 *   - Each deleteOrg() call is wrapped in its own try/catch so one bad org
 *     does not block the rest.
 *   - runGuarded() catches anything that escapes and keeps the worker alive.
 */
import { sql } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { deleteOrg } from '$lib/server/org/deleteOrg';
import { createLogger } from '$lib/server/log';
import type { CronJobResult } from './index';

const log = createLogger('cron.org-lifecycle');

export async function runOrgLifecycleAdvance(): Promise<CronJobResult> {
	const promoted = await db.execute<{ id: string }>(sql`
		UPDATE organizations
		SET status = 'pending_deletion',
			deletion_scheduled_at = now() + INTERVAL '7 days',
			updated_at = now()
		WHERE status = 'suspended'
			AND suspended_at IS NOT NULL
			AND suspended_at < now() - INTERVAL '90 days'
			AND deleted_at IS NULL
		RETURNING id
	`);
	const promotedRows = promoted as unknown as { id: string }[];

	const due = await db.execute<{ id: string }>(sql`
		SELECT id FROM organizations
		WHERE status = 'pending_deletion'
			AND deletion_scheduled_at IS NOT NULL
			AND deletion_scheduled_at < now()
			AND deleted_at IS NULL
	`);
	const dueRows = due as unknown as { id: string }[];

	let deleted = 0;
	let errors = 0;
	for (const org of dueRows) {
		try {
			await deleteOrg(org.id);
			deleted += 1;
		} catch (err) {
			errors += 1;
			const message = err instanceof Error ? err.message : String(err);
			log.error({ org_id: org.id, phase: 'lifecycle_delete', error: message });
		}
	}

	return {
		scanned_count: promotedRows.length + dueRows.length,
		affected_count: promotedRows.length + deleted,
		processed_count: deleted,
		skipped_count: 0,
		error_count: errors,
		promoted_to_pending_deletion: promotedRows.length,
		deleted_orgs: deleted
	};
}
