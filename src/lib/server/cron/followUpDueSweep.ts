/**
 * Cron — Contact follow-up due sweep.
 *
 * Schedule: every 15 minutes (UTC).
 * Purpose:  When a contractor sets next_follow_up_at on a contact and that time
 *           arrives, emit contact.follow_up_due so the outbox worker can notify
 *           the assigned member in-app. Without this the field was just a sticky
 *           note nobody saw.
 * Behavior:
 *   - Only contacts that are still active (not soft-deleted, not archived) AND
 *     have an assigned member are claimed — an unowned reminder has nobody to
 *     notify, so it is left pending until the contact is assigned.
 *   - next_follow_up_at is cleared in the SAME transaction the event is emitted
 *     (transaction boundary law), so the reminder fires exactly once. Re-dating
 *     a contact arms a fresh reminder.
 * Idempotency:
 *   - The field is cleared on claim, so a re-run never re-selects the same row.
 *   - outbox_events.idempotency_key = `contact.follow_up_due:{contact_id}:{due_iso}`
 *     is a UNIQUE safety net against a double-emit for the same due instant.
 * Failure behavior:
 *   - Errors are caught by runGuarded() in cron/index.ts; the worker keeps
 *     running other jobs.
 */
import { sql } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import type { CronJobResult } from './index';

type DueRow = {
	id: string;
	org_id: string;
	assigned_to: string;
	full_name: string;
	due_at: string;
	[key: string]: unknown;
};

const CLAIM_LIMIT = 500;

export async function runFollowUpDueSweep(): Promise<CronJobResult> {
	return db.transaction(async (tx) => {
		// Snapshot the due rows (capturing the old due time) and clear the field in
		// one statement. The `due` CTE locks the rows with SKIP LOCKED so concurrent
		// sweeps never double-claim; `cleared` nulls next_follow_up_at; the final
		// SELECT returns the pre-clear values for the outbox payload.
		const claimed = await tx.execute<DueRow>(sql`
			WITH due AS (
				SELECT id, org_id, assigned_to, full_name, next_follow_up_at
				FROM contacts
				WHERE next_follow_up_at IS NOT NULL
					AND next_follow_up_at <= now()
					AND deleted_at IS NULL
					AND status <> 'archived'
					AND assigned_to IS NOT NULL
				ORDER BY next_follow_up_at ASC
				FOR UPDATE SKIP LOCKED
				LIMIT ${CLAIM_LIMIT}
			), cleared AS (
				UPDATE contacts c
				SET next_follow_up_at = NULL, updated_at = now()
				FROM due
				WHERE c.id = due.id
			)
			SELECT id, org_id, assigned_to, full_name, next_follow_up_at AS due_at
			FROM due
		`);

		const rows = claimed as unknown as DueRow[];
		let processed = 0;

		for (const row of rows) {
			const dueIso = new Date(row.due_at).toISOString();
			const payload = {
				event_version: 1,
				contact_id: row.id,
				org_id: row.org_id,
				assigned_to: row.assigned_to,
				full_name: row.full_name,
				due_at: dueIso
			};

			await tx.execute(sql`
				INSERT INTO outbox_events (
					org_id, event_type, event_version, resource_type, resource_id,
					payload, idempotency_key
				) VALUES (
					${row.org_id}, 'contact.follow_up_due', 1, 'contact', ${row.id},
					${JSON.stringify(payload)}::jsonb,
					${`contact.follow_up_due:${row.id}:${dueIso}`}
				)
				ON CONFLICT (idempotency_key) DO NOTHING
			`);

			processed += 1;
		}

		return {
			scanned_count: rows.length,
			affected_count: rows.length,
			processed_count: processed,
			skipped_count: 0,
			error_count: 0
		};
	});
}
