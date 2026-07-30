// Create one draft invoice for a job, inside the caller's transaction (Jobber's per-job invoice
// generation). Shared by the single-job "Generate invoice" route (POST /api/jobs/[id]/generate-invoice)
// and Batch Create (POST /api/jobs/batch-invoice), so both paths bill a job identically.
//
// Branches on the job's billing_type (Jobber billingType):
//
//  • fixed_price ('fixed') — snapshots the job's line items onto the invoice (Jobber FIXED_PRICE:
//    "the job's line items are pulled onto the invoice"), carrying the job's discount + tax so the
//    invoice bills the agreed price. Covers on-completion and periodic fixed billing.
//  • visit_based — rolls unbilled, non-cancelled visits into one invoice, each visit a line priced
//    at the job's line-item total. Each billed visit is stamped billed_invoice_id so it can never
//    be billed twice (the idempotency anchor). The job row is locked FOR UPDATE so concurrent
//    presses serialize.
//
// An optional `visitIds` (from the "Select visits to invoice" picker — Jobber ref/billing/21) bills
// EXACTLY those visits (any date, so the invoice-ahead upcoming visit can be selected). Omitting it
// keeps the "all PAST unbilled visits" default — this is what Batch Create uses (bills what's due,
// no per-job picker). Every selected id must still be an unbilled, non-cancelled, dated visit of this
// job or the call 422s.
//
// Throws SvelteKit `error(...)` on invalid state (404 / 422). Must run INSIDE a db.transaction — the
// caller owns the boundary, so a batch loop can wrap each job in its own txn and continue past a
// failure without rolling back the others.

import { error } from '@sveltejs/kit';
import { and, asc, eq, inArray, isNotNull, isNull, lte, ne, sql } from 'drizzle-orm';
import type { PgTransaction } from 'drizzle-orm/pg-core';
import { appointments, invoiceLineItems, invoices, jobLineItems, orgCounters } from '$lib/server/db/schema';
import { generateToken } from '$lib/server/quotes/token';
import { recalcInvoiceTotals } from '$lib/server/invoices/recalc';
import { orgLateFeeSnapshot } from '$lib/server/invoices/lateFee';
import { repinOneOffJobSchedule } from '$lib/server/jobs/repinSchedule';
import { dischargeJobInvoiceReminders } from '$lib/server/jobs/reminderDischarge';

type Tx = PgTransaction<any, any, any>;

export async function createJobInvoice(
	tx: Tx,
	opts: {
		orgId: string;
		jobId: string;
		/** Member creating the invoice (issued_by + completed_by stamps). */
		memberId: string;
		/** Explicit visit selection (visit_based picker). Omit/null = all past unbilled visits. */
		visitIds?: string[] | null;
	}
): Promise<{ id: string; invoice_number: number; visit_count: number }> {
	const { orgId, jobId, memberId } = opts;
	const visitIds = opts.visitIds ?? null;

	// Lock the job — serializes concurrent generate presses for the same job.
	const [job] = await tx.execute<{
		id: string;
		contact_id: string;
		opportunity_id: string | null;
		title: string;
		tax_rate: string;
		total: string;
		billing_type: string;
		billing_frequency: string;
		discount_type: string;
		discount_value: string | null;
		discount_label: string | null;
	}>(sql`
		SELECT id, contact_id, opportunity_id, title, tax_rate, total,
		       billing_type, billing_frequency, discount_type, discount_value, discount_label
		FROM jobs
		WHERE id = ${jobId} AND org_id = ${orgId} AND deleted_at IS NULL
		FOR UPDATE
	`);
	if (!job) throw error(404, 'Job not found');
	if (job.billing_frequency === 'never') {
		throw error(422, 'Set up billing on this job before generating an invoice.');
	}

	// Build the invoice line(s) first so we can 422 cleanly before allocating a number.
	let lines: {
		description: string;
		quantity: string;
		unit: string | null;
		unit_price: string;
		taxable: boolean;
		unit_cost: string | null;
		source_catalog_item_id: string | null;
		total: string;
		position: number;
	}[];
	const invoiceTaxRate = job.tax_rate;
	let discountType = 'none';
	let discountValue: string | null = null;
	let discountLabel: string | null = null;
	let billedVisitIds: string[] = [];

	if (job.billing_type === 'visit_based') {
		const perVisit = Number(job.total);
		if (!(perVisit > 0)) {
			throw error(422, 'Add line items to the job to set the per-visit price before invoicing.');
		}
		// Unbilled, non-cancelled, dated visits of this job. With an explicit selection we bill
		// exactly those ids (any date — the picker may include the invoice-ahead upcoming visit);
		// otherwise we bill every PAST visit (the legacy "Generate invoice" behavior).
		const visits = await tx
			.select({
				id: appointments.id,
				title: appointments.title,
				scheduled_start: appointments.scheduled_start
			})
			.from(appointments)
			.where(
				and(
					eq(appointments.job_id, jobId),
					eq(appointments.org_id, orgId),
					isNull(appointments.deleted_at),
					isNull(appointments.billed_invoice_id),
					ne(appointments.status, 'cancelled'),
					isNotNull(appointments.scheduled_start),
					visitIds
						? inArray(appointments.id, visitIds)
						: lte(appointments.scheduled_start, new Date())
				)
			)
			.orderBy(asc(appointments.scheduled_start));

		// A selected id that didn't come back is already billed / cancelled / not this job's —
		// refuse rather than silently invoice a partial set (the picker may be stale).
		if (visitIds && visits.length !== visitIds.length) {
			throw error(422, 'Some selected visits can no longer be invoiced. Refresh and try again.');
		}
		if (visits.length === 0) {
			throw error(422, 'No unbilled visits to invoice yet.');
		}

		const perVisitStr = perVisit.toFixed(2);
		billedVisitIds = visits.map((v) => v.id);
		lines = visits.map((v, idx) => ({
			// Date suffix (UTC calendar date) keeps each visit line distinguishable.
			// Non-null: the query filters scheduled_start <= now(), excluding unscheduled visits.
			description: `${v.title} — ${v.scheduled_start!.toISOString().slice(0, 10)}`,
			quantity: '1',
			unit: null,
			unit_price: perVisitStr,
			taxable: true,
			unit_cost: null,
			source_catalog_item_id: null,
			total: perVisitStr,
			position: idx
		}));
	} else {
		// fixed_price: snapshot the job's line items (Jobber FIXED_PRICE) with the job's discount.
		const sourceLines = await tx
			.select({
				description: jobLineItems.description,
				details: jobLineItems.details,
				quantity: jobLineItems.quantity,
				unit: jobLineItems.unit,
				unit_price: jobLineItems.unit_price,
				taxable: jobLineItems.taxable,
				unit_cost: jobLineItems.unit_cost,
				source_catalog_item_id: jobLineItems.source_catalog_item_id,
				total: jobLineItems.total,
				position: jobLineItems.position
			})
			.from(jobLineItems)
			.where(
				and(
					eq(jobLineItems.job_id, jobId),
					eq(jobLineItems.org_id, orgId),
					isNull(jobLineItems.deleted_at)
				)
			)
			.orderBy(asc(jobLineItems.position));

		if (sourceLines.length === 0) {
			throw error(422, 'Add at least one line item to the job before invoicing.');
		}

		discountType = job.discount_type;
		discountValue = job.discount_value;
		discountLabel = job.discount_label;
		lines = sourceLines.map((li, idx) => ({
			// Invoice lines are single-text; fold the job line's optional description in.
			description: li.details?.trim() ? `${li.description}\n${li.details.trim()}` : li.description,
			quantity: li.quantity,
			unit: li.unit,
			unit_price: li.unit_price,
			taxable: li.taxable,
			unit_cost: li.unit_cost,
			source_catalog_item_id: li.source_catalog_item_id,
			total: li.total,
			position: idx
		}));
	}

	// Allocate invoice number (self-heal a missing counter row before locking).
	await tx.execute(sql`
		INSERT INTO org_counters (org_id) VALUES (${orgId})
		ON CONFLICT (org_id) DO NOTHING
	`);
	const [counter] = await tx.execute<{ next_invoice_number: number }>(sql`
		SELECT next_invoice_number FROM org_counters WHERE org_id = ${orgId} FOR UPDATE
	`);
	if (!counter) throw new Error('Org counter missing');
	const invoiceNumber = counter.next_invoice_number;
	await tx
		.update(orgCounters)
		.set({ next_invoice_number: invoiceNumber + 1, updated_at: new Date() })
		.where(eq(orgCounters.org_id, orgId));

	const rawToken = generateToken();
	const lf = await orgLateFeeSnapshot(tx, orgId);

	const [inserted] = await tx
		.insert(invoices)
		.values({
			org_id: orgId,
			contact_id: job.contact_id,
			job_id: job.id,
			opportunity_id: job.opportunity_id,
			issued_by: memberId,
			invoice_number: invoiceNumber,
			title: job.title,
			status: 'draft',
			tax_rate: invoiceTaxRate,
			// recalcInvoiceTotals recomputes discount_amount from the snapshot lines.
			discount_type: discountType,
			discount_value: discountValue,
			discount_label: discountLabel,
			late_fee_enabled: lf.late_fee_enabled,
			late_fee_type: lf.late_fee_type,
			late_fee_value: lf.late_fee_value,
			public_token: rawToken
		})
		.returning();

	await tx.insert(invoiceLineItems).values(
		lines.map((l) => ({
			org_id: orgId,
			invoice_id: inserted.id,
			description: l.description,
			quantity: l.quantity,
			unit: l.unit,
			unit_price: l.unit_price,
			taxable: l.taxable,
			unit_cost: l.unit_cost,
			source_catalog_item_id: l.source_catalog_item_id,
			total: l.total,
			position: l.position
		}))
	);
	await recalcInvoiceTotals(tx, inserted.id);

	// Stamp the billed visits so they can never be invoiced again (visit-based only).
	const now = new Date();
	if (billedVisitIds.length > 0) {
		await tx
			.update(appointments)
			.set({ billed_invoice_id: inserted.id, updated_at: now })
			.where(inArray(appointments.id, billedVisitIds));

		// Jobber: invoicing a DUE/arrived visit auto-marks it COMPLETED so the job's schedule badge
		// can leave "Late" once nothing past is still open. A FUTURE (invoice-ahead) visit stays
		// 'scheduled' — it's billed but its work hasn't happened, so it only completes when its date
		// passes (a separate scheduled mechanism). NO outbox appointment.completed event: this is an
		// internal, invoice-driven status change and must not fire visit-completion automations.
		const completed = await tx
			.update(appointments)
			.set({
				status: 'completed',
				completed_at: now,
				completed_by: memberId,
				// Marks the completion as invoice-driven so deleting this invoice can revert exactly
				// these visits (and never a crew-entered completion, which leaves this NULL).
				completed_via_invoice_id: inserted.id,
				updated_at: now
			})
			.where(
				and(
					eq(appointments.org_id, orgId),
					inArray(appointments.id, billedVisitIds),
					eq(appointments.status, 'scheduled'),
					lte(appointments.scheduled_start, now)
				)
			)
			.returning({ id: appointments.id });

		// If any visit actually completed, re-pin the job's denormalized scheduled_start/_end to its
		// earliest still-open visit so the list badge follows the visit rows. No-op for series-anchor
		// / recurring / as-needed jobs (guarded inside the helper); real for a one-off visit_based job.
		if (completed.length > 0) {
			await repinOneOffJobSchedule(tx, { orgId, jobId });
		}
	}

	// Auto-complete this job's invoice reminders: every billed visit's own reminder, PLUS any
	// reminder whose date window covers today. Runs for fixed/periodic invoices too (no billed visits).
	await dischargeJobInvoiceReminders(tx, {
		orgId,
		jobId,
		now,
		billedVisitIds,
		completedBy: memberId
	});

	return { id: inserted.id, invoice_number: invoiceNumber, visit_count: billedVisitIds.length };
}
