/**
 * Cron — Invoice reminder due sweep.
 *
 * Schedule: every 15 minutes (UTC).
 * Purpose:  When an invoice reminder's scheduled date arrives, emit
 *           job_invoice_reminder.due so the outbox worker can nudge the assignee
 *           (admin/manager fallback) that it's time to bill the job. Without this
 *           a dated reminder did nothing when its day came — it just turned red in
 *           the job's Billing → Reminders tab, so it nudged nobody. This is the
 *           Jobber "an invoice reminder comes due → surface the job for invoicing"
 *           prompt (jobber-04 §5.4 / jobber-05 §6). Money-truth (the needs_invoice
 *           badge) is unchanged — reminders are the PROMPT layer only.
 * Behavior:
 *   - Claims active, dated, not-yet-notified, non-deleted reminders whose
 *     scheduled_start has passed. Both auto and manual reminders qualify.
 *   - Stamps due_notified_at in the SAME transaction the event is emitted
 *     (transaction boundary law), so the reminder fires its nudge exactly once.
 *     Re-dating a reminder (PATCH clears due_notified_at) arms a fresh nudge.
 * Idempotency:
 *   - due_notified_at is stamped on claim, so a re-run never re-selects the row.
 *   - outbox_events.idempotency_key = `job_invoice_reminder.due:{id}:{due_iso}`
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
	job_id: string;
	due_at: string;
	[key: string]: unknown;
};

const CLAIM_LIMIT = 500;

export async function runJobInvoiceReminderDueSweep(): Promise<CronJobResult> {
	return db.transaction(async (tx) => {
		// Snapshot the due reminders (capturing the due instant) and stamp due_notified_at in
		// one statement. The `due` CTE locks the rows with SKIP LOCKED so concurrent sweeps
		// never double-claim; `marked` stamps due_notified_at; the final SELECT returns the
		// values needed for the outbox payload.
		const claimed = await tx.execute<DueRow>(sql`
			WITH due AS (
				SELECT id, org_id, job_id, scheduled_start
				FROM job_invoice_reminders
				WHERE status = 'active'
					AND scheduled_start IS NOT NULL
					AND scheduled_start <= now()
					AND due_notified_at IS NULL
					AND deleted_at IS NULL
				ORDER BY scheduled_start ASC
				FOR UPDATE SKIP LOCKED
				LIMIT ${CLAIM_LIMIT}
			), marked AS (
				UPDATE job_invoice_reminders r
				SET due_notified_at = now(), updated_at = now()
				FROM due
				WHERE r.id = due.id
			)
			SELECT id, org_id, job_id, scheduled_start AS due_at
			FROM due
		`);

		const rows = claimed as unknown as DueRow[];
		let processed = 0;

		for (const row of rows) {
			const dueIso = new Date(row.due_at).toISOString();
			const payload = {
				event_version: 1,
				reminder_id: row.id,
				org_id: row.org_id,
				job_id: row.job_id,
				due_at: dueIso
			};

			await tx.execute(sql`
				INSERT INTO outbox_events (
					org_id, event_type, event_version, resource_type, resource_id,
					payload, idempotency_key
				) VALUES (
					${row.org_id}, 'job_invoice_reminder.due', 1, 'job_invoice_reminder', ${row.id},
					${JSON.stringify(payload)}::jsonb,
					${`job_invoice_reminder.due:${row.id}:${dueIso}`}
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
