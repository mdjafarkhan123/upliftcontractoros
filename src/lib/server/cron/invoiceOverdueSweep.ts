/**
 * Cron 1 — Invoice overdue sweep.
 *
 * Schedule: 0 2 * * * (UTC).
 * Purpose:  Flip eligible invoices to 'overdue' and emit invoice.overdue events
 *           so the outbox worker can enqueue a single invoice_reminder job.
 * Idempotency:
 *   - UPDATE only matches sent/partially_paid rows past due_date, so a re-run
 *     produces no transitions and no events.
 *   - outbox_events.idempotency_key = `invoice.overdue:{invoice_id}:{utc_date}`
 *     is UNIQUE; same-day duplicates are silently skipped via ON CONFLICT.
 *   - Before emitting, we check automation_jobs for an existing pending or
 *     processing invoice_reminder for the invoice — if present, skip emission
 *     so we never enqueue a duplicate reminder.
 * Failure behavior:
 *   - Errors are caught by runGuarded() in cron/index.ts; the worker keeps
 *     running other jobs.
 */
import { sql } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import type { CronJobResult } from './index';

type OverdueRow = {
	id: string;
	org_id: string;
	contact_id: string;
	invoice_number: number;
	total: string;
	due_date: string | null;
	[key: string]: unknown;
};

export async function runInvoiceOverdueSweep(): Promise<CronJobResult> {
	const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC

	return db.transaction(async (tx) => {
		const updated = await tx.execute<OverdueRow>(sql`
			UPDATE invoices
			SET status = 'overdue', updated_at = now()
			WHERE status IN ('sent', 'partially_paid')
				AND due_date < CURRENT_DATE
				AND deleted_at IS NULL
			RETURNING id, org_id, contact_id, invoice_number, total, due_date
		`);

		const rows = updated as unknown as OverdueRow[];
		let processed = 0;
		let skipped = 0;

		for (const inv of rows) {
			const existing = await tx.execute<{ id: string; [key: string]: unknown }>(sql`
				SELECT id FROM automation_jobs
				WHERE org_id = ${inv.org_id}
					AND type = 'invoice_reminder'
					AND resource_type = 'invoice'
					AND resource_id = ${inv.id}
					AND status IN ('pending', 'processing')
				LIMIT 1
			`);
			if ((existing as unknown as { id: string }[]).length > 0) {
				skipped += 1;
				continue;
			}

			const idempotencyKey = `invoice.overdue:${inv.id}:${today}`;
			const payload = {
				invoice_id: inv.id,
				contact_id: inv.contact_id,
				invoice_number: inv.invoice_number,
				total: inv.total,
				due_date: inv.due_date
			};

			await tx.execute(sql`
				INSERT INTO outbox_events (
					org_id, event_type, event_version, resource_type, resource_id,
					payload, idempotency_key
				) VALUES (
					${inv.org_id}, 'invoice.overdue', 1, 'invoice', ${inv.id},
					${JSON.stringify(payload)}::jsonb,
					${idempotencyKey}
				)
				ON CONFLICT (idempotency_key) DO NOTHING
			`);

			processed += 1;
		}

		return {
			scanned_count: rows.length,
			affected_count: rows.length,
			processed_count: processed,
			skipped_count: skipped,
			error_count: 0
		};
	});
}
