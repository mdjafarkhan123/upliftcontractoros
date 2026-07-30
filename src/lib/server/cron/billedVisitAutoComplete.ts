/**
 * Cron — Billed-visit auto-complete sweep.
 *
 * Schedule: every 15 minutes (UTC).
 * Purpose:  Jobber "invoice-ahead" behavior. When a FUTURE visit is invoiced early
 *           (billed_invoice_id stamped) it deliberately stays 'scheduled' — the work
 *           hasn't happened yet. But once that date PASSES, an already-invoiced visit
 *           must not turn its job "Late": in Jobber it silently becomes Completed. The
 *           open/Late derivation keys purely on status='scheduled', so flipping the
 *           status to 'completed' is what removes it from the open set.
 *
 *           This is the deferred "Part 2" companion to the generate-invoice route's
 *           Part 1 (which completes a DUE/arrived billed visit immediately). Part 1
 *           handles visits whose date had already passed at invoice time; this handles
 *           the invoice-ahead visit whose date passes LATER.
 * Behavior:
 *   - Claims visits that are status='scheduled', already billed (billed_invoice_id set),
 *     dated in the past (scheduled_start <= now()), not deleted.
 *   - Sets status='completed', completed_at=now(), completed_by=NULL (a SYSTEM completion —
 *     no member did it), and completed_via_invoice_id = billed_invoice_id. That last field
 *     is the invoice-driven-completion marker: it keeps this consistent with the
 *     generate-invoice route AND lets DELETE /api/invoices/[id] (migration 0172) revert
 *     exactly these completions if the invoice is later deleted.
 *   - NO outbox event — an invoice-driven internal status change must never fire
 *     visit-completion automations to the client/crew (mirrors the Part 1 comment).
 *   - Re-pins each touched job's denormalized scheduled_start/_end to its earliest still-open
 *     visit so list badges follow the visit rows (no-op for recurring/as-needed jobs).
 * Idempotency:
 *   - Once flipped to 'completed' a visit no longer matches status='scheduled', so a re-run
 *     never re-selects it.
 * Failure behavior:
 *   - Errors are caught by runGuarded() in cron/index.ts; the worker keeps running other jobs.
 */
import { and, eq, isNotNull, isNull, lte, sql } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { appointments } from '$lib/server/db/schema';
import { repinOneOffJobSchedule } from '$lib/server/jobs/repinSchedule';
import type { CronJobResult } from './index';

export async function runBilledVisitAutoComplete(): Promise<CronJobResult> {
	return db.transaction(async (tx) => {
		const now = new Date();

		// Flip every past, already-billed, still-scheduled visit to Completed. completed_via_invoice_id
		// is copied from billed_invoice_id so the completion is marked invoice-driven (revertable on
		// invoice delete). completed_by stays NULL: no member performed this.
		const completed = await tx
			.update(appointments)
			.set({
				status: 'completed',
				completed_at: now,
				completed_by: null,
				completed_via_invoice_id: sql`${appointments.billed_invoice_id}`,
				updated_at: now
			})
			.where(
				and(
					eq(appointments.status, 'scheduled'),
					isNotNull(appointments.billed_invoice_id),
					isNull(appointments.deleted_at),
					isNotNull(appointments.scheduled_start),
					lte(appointments.scheduled_start, now)
				)
			)
			.returning({
				id: appointments.id,
				org_id: appointments.org_id,
				job_id: appointments.job_id
			});

		// Re-pin each distinct (org, job) once so the job's denormalized schedule follows the visit
		// rows. Guarded inside the helper — no-op for series-anchor / recurring / as-needed jobs.
		const seen = new Set<string>();
		for (const row of completed) {
			if (!row.job_id) continue;
			const key = `${row.org_id}:${row.job_id}`;
			if (seen.has(key)) continue;
			seen.add(key);
			await repinOneOffJobSchedule(tx, { orgId: row.org_id, jobId: row.job_id });
		}

		return {
			scanned_count: completed.length,
			affected_count: completed.length,
			processed_count: completed.length,
			skipped_count: 0,
			error_count: 0
		};
	});
}
