/**
 * Cron — Opportunity follow-up due sweep.
 *
 * Schedule: every 15 minutes (UTC).
 * Purpose:  When a contractor sets next_follow_up_at on a deal and that time
 *           arrives, emit opportunity.follow_up_due so the outbox worker can
 *           notify the right member in-app/push. Mirrors the proven
 *           contacts.next_follow_up_at stack (followUpDueSweep.ts).
 * Behavior:
 *   - Only OPEN, non-deleted deals whose follow-up time has arrived are claimed.
 *     UNLIKE the contact sweep, a deal with NO assignee is still claimed — the
 *     recipient is resolved in the worker (assignee, else admin/manager fallback
 *     via pipelineRecipients) so a reminder never silently dies on an unassigned
 *     deal.
 *   - next_follow_up_at is cleared in the SAME transaction the event is emitted
 *     (transaction boundary law), so the reminder fires exactly once. Re-dating a
 *     deal arms a fresh reminder.
 *   - The contact join carries full_name + last_contacted_at so the notification
 *     can render rich copy ("...last contact 5d ago").
 * Idempotency:
 *   - The field is cleared on claim, so a re-run never re-selects the same row.
 *   - outbox_events.idempotency_key =
 *     `opportunity.follow_up_due:{opportunity_id}:{due_iso}` is a UNIQUE safety
 *     net against a double-emit for the same due instant.
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
	contact_id: string;
	assigned_to: string | null;
	title: string;
	value: string | null;
	full_name: string;
	last_contacted_at: string | null;
	due_at: string;
	[key: string]: unknown;
};

const CLAIM_LIMIT = 500;

export async function runOpportunityFollowUpDueSweep(): Promise<CronJobResult> {
	return db.transaction(async (tx) => {
		// Snapshot the due deals (capturing the old due time + contact context) and
		// clear the field in one statement. The `due` CTE locks the rows with SKIP
		// LOCKED so concurrent sweeps never double-claim; `cleared` nulls
		// next_follow_up_at; the final SELECT returns the pre-clear values for the
		// outbox payload.
		const claimed = await tx.execute<DueRow>(sql`
			WITH due AS (
				SELECT o.id, o.org_id, o.contact_id, o.assigned_to, o.title, o.value,
					o.next_follow_up_at, c.full_name, c.last_contacted_at
				FROM opportunities o
				JOIN contacts c ON c.id = o.contact_id
				WHERE o.next_follow_up_at IS NOT NULL
					AND o.next_follow_up_at <= now()
					AND o.status = 'open'
					AND o.deleted_at IS NULL
				ORDER BY o.next_follow_up_at ASC
				FOR UPDATE OF o SKIP LOCKED
				LIMIT ${CLAIM_LIMIT}
			), cleared AS (
				UPDATE opportunities o
				SET next_follow_up_at = NULL, updated_at = now()
				FROM due
				WHERE o.id = due.id
			)
			SELECT id, org_id, contact_id, assigned_to, title, value, full_name,
				last_contacted_at, next_follow_up_at AS due_at
			FROM due
		`);

		const rows = claimed as unknown as DueRow[];
		let processed = 0;

		for (const row of rows) {
			const dueIso = new Date(row.due_at).toISOString();
			const payload = {
				event_version: 1,
				opportunity_id: row.id,
				org_id: row.org_id,
				contact_id: row.contact_id,
				assigned_to: row.assigned_to,
				title: row.title,
				value: row.value,
				full_name: row.full_name,
				last_contacted_at: row.last_contacted_at
					? new Date(row.last_contacted_at).toISOString()
					: null,
				due_at: dueIso
			};

			await tx.execute(sql`
				INSERT INTO outbox_events (
					org_id, event_type, event_version, resource_type, resource_id,
					payload, idempotency_key
				) VALUES (
					${row.org_id}, 'opportunity.follow_up_due', 1, 'opportunity', ${row.id},
					${JSON.stringify(payload)}::jsonb,
					${`opportunity.follow_up_due:${row.id}:${dueIso}`}
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
