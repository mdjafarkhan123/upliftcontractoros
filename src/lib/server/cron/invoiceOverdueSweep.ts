/**
 * Cron 1 — Invoice overdue sweep (+ auto late-fee pass).
 *
 * Schedule: 0 2 * * * (UTC).
 * Purpose:
 *   Phase A — Flip eligible invoices to 'overdue' and emit invoice.overdue events so the
 *             outbox worker can enqueue a single invoice_reminder job.
 *   Phase B — (M8 Phase 2) Auto-apply a one-time late fee to invoices that are overdue past
 *             the org's grace period, computing the fee from each invoice's own snapshot terms.
 * Idempotency:
 *   Phase A:
 *   - UPDATE only matches sent/partially_paid rows past due_date, so a re-run produces no
 *     transitions and no events.
 *   - outbox_events.idempotency_key = `invoice.overdue:{invoice_id}:{utc_date}` is UNIQUE;
 *     same-day duplicates are silently skipped via ON CONFLICT.
 *   - Before emitting, we check automation_jobs for an existing pending/processing
 *     invoice_reminder for the invoice — if present, skip so we never enqueue a duplicate.
 *   Phase B (MONEY — charge exactly once):
 *   - Each candidate is charged inside its OWN transaction that locks the invoice row
 *     (SELECT … FOR UPDATE) and re-checks, under that lock, that NO is_late_fee line already
 *     exists. That "no existing fee line" guard is the single-charge guarantee: a concurrent
 *     run or a re-run finds the fee already present and skips. All gates (org + invoice opted
 *     in, past grace, unpaid balance) are re-verified under the lock before inserting.
 * Failure behavior:
 *   - Errors are caught by runGuarded() in cron/index.ts. Phase B isolates each invoice in its
 *     own try/catch so one bad row never aborts the rest of the pass.
 */
import { sql } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { invoiceLineItems } from '$lib/server/db/schema';
import { recalcInvoiceTotals } from '$lib/server/invoices/recalc';
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

type LateFeeCandidate = {
	id: string;
	org_id: string;
	[key: string]: unknown;
};

type LockedInvoice = {
	id: string;
	org_id: string;
	status: string;
	amount_due: string;
	due_date: string | null;
	late_fee_enabled: boolean;
	late_fee_type: string | null;
	late_fee_value: string | null;
	existing_fee: string | null;
	max_position: number | null;
	org_late_fee_enabled: boolean;
	grace_days: number;
	[key: string]: unknown;
};

function round2(n: number): number {
	return Math.round(n * 100) / 100;
}

export async function runInvoiceOverdueSweep(): Promise<CronJobResult> {
	const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC

	// ── Phase A: flip to overdue + emit reminder events ─────────────────────────
	const phaseA = await db.transaction(async (tx) => {
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

		return { scanned: rows.length, processed, skipped };
	});

	// ── Phase B: auto-apply one-time late fees past the grace period ─────────────
	// Candidate shortlist (no locks). `due_date + grace_days` is date arithmetic: a Postgres
	// date plus an integer advances by that many days. Every gate is re-checked under the row
	// lock below before any money moves; this query just narrows the working set.
	const candidates = (await db.execute<LateFeeCandidate>(sql`
		SELECT i.id, i.org_id
		FROM invoices i
		JOIN organizations o ON o.id = i.org_id
		WHERE i.deleted_at IS NULL
			AND i.status IN ('sent', 'partially_paid', 'overdue')
			AND i.due_date IS NOT NULL
			-- Genuinely past due (day after the due date at the earliest, matching the overdue flip)
			-- AND past the grace window. For grace=0 this collapses to "the day after it's due".
			AND i.due_date < CURRENT_DATE
			AND (i.due_date + o.late_fee_grace_days) <= CURRENT_DATE
			AND o.late_fee_enabled = true
			AND i.late_fee_enabled = true
			AND i.amount_due > 0
			AND NOT EXISTS (
				SELECT 1 FROM invoice_line_items li
				WHERE li.invoice_id = i.id AND li.is_late_fee = true AND li.deleted_at IS NULL
			)
	`)) as unknown as LateFeeCandidate[];

	let feeApplied = 0;
	let feeSkipped = 0;
	let feeErrors = 0;

	for (const cand of candidates) {
		try {
			const applied = await db.transaction(async (tx) => {
				const [inv] = (await tx.execute<LockedInvoice>(sql`
					SELECT
						i.id,
						i.org_id,
						i.status,
						i.amount_due,
						i.due_date,
						i.late_fee_enabled,
						i.late_fee_type,
						i.late_fee_value,
						o.late_fee_enabled AS org_late_fee_enabled,
						o.late_fee_grace_days AS grace_days,
						(SELECT total FROM invoice_line_items li
							WHERE li.invoice_id = i.id AND li.is_late_fee = true AND li.deleted_at IS NULL
							LIMIT 1) AS existing_fee,
						(SELECT MAX(position) FROM invoice_line_items li
							WHERE li.invoice_id = i.id AND li.deleted_at IS NULL) AS max_position
					FROM invoices i
					JOIN organizations o ON o.id = i.org_id
					WHERE i.id = ${cand.id} AND i.org_id = ${cand.org_id} AND i.deleted_at IS NULL
					FOR UPDATE OF i
				`)) as unknown as LockedInvoice[];

				if (!inv) return false;

				// Re-verify every gate under the lock. The existing-fee check is the charge-once guard.
				if (inv.existing_fee != null) return false;
				if (!inv.org_late_fee_enabled || !inv.late_fee_enabled) return false;
				if (!['sent', 'partially_paid', 'overdue'].includes(inv.status)) return false;
				if (Number(inv.amount_due) <= 0) return false;
				if (inv.due_date == null) return false;
				// Genuinely past due (not merely due today), matching the candidate query + overdue flip.
				if (inv.due_date >= today) return false;
				// Past grace: due_date + grace_days <= today (UTC date). Compare as ISO date strings.
				const graceDate = new Date(inv.due_date);
				graceDate.setUTCDate(graceDate.getUTCDate() + Number(inv.grace_days ?? 0));
				if (graceDate.toISOString().slice(0, 10) > today) return false;

				// Compute the fee from the invoice's own snapshot terms (mirrors the manual endpoint).
				let feeAmount: number;
				if (inv.late_fee_type === 'flat') {
					feeAmount = round2(Number(inv.late_fee_value ?? 0));
				} else {
					const pct = Number(inv.late_fee_value ?? 0);
					feeAmount = round2(Number(inv.amount_due) * (pct / 100));
				}
				if (!Number.isFinite(feeAmount) || feeAmount <= 0) return false;

				const feeStr = feeAmount.toFixed(2);
				await tx.insert(invoiceLineItems).values({
					org_id: inv.org_id,
					invoice_id: inv.id,
					description: 'Late fee',
					quantity: '1',
					unit_price: feeStr,
					taxable: false,
					is_late_fee: true,
					total: feeStr,
					position: (inv.max_position ?? 0) + 1
				});

				await recalcInvoiceTotals(tx, inv.id);
				return true;
			});

			if (applied) feeApplied += 1;
			else feeSkipped += 1;
		} catch {
			feeErrors += 1;
		}
	}

	return {
		scanned_count: phaseA.scanned + candidates.length,
		affected_count: phaseA.scanned,
		processed_count: phaseA.processed,
		skipped_count: phaseA.skipped,
		error_count: feeErrors,
		late_fee_candidates: candidates.length,
		late_fee_applied: feeApplied,
		late_fee_skipped: feeSkipped,
		late_fee_errors: feeErrors
	};
}
