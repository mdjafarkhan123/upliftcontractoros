import { json, error } from '@sveltejs/kit';
import { and, asc, eq, inArray, isNull, lte, ne, sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { appointments, invoiceLineItems, invoices, orgCounters } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canCreateInvoice } from '$lib/server/invoices/permissions';
import { generateToken } from '$lib/server/quotes/token';
import { recalcInvoiceTotals } from '$lib/server/invoices/recalc';
import { orgLateFeeSnapshot } from '$lib/server/invoices/lateFee';
import { formatInvoiceNumber } from '$lib/server/invoices/format';

// Generate an invoice for a RECURRING-billing job on demand ("Generate invoice" on the Billing
// card). Manual v1 — the contractor presses this; nothing auto-charges (that layer is deferred).
//
//  • visit_based — rolls every PAST, unbilled, non-cancelled visit into one invoice, each visit a
//    line priced at the job's line-item total (the lines describe one visit's work). Each billed
//    visit is stamped with billed_invoice_id so it can never be billed twice (the idempotency
//    anchor). The job row is locked FOR UPDATE so two concurrent presses serialize.
//  • fixed — one flat tax-inclusive line for the job's fixed_invoice_amount. Each press creates a
//    fresh period invoice by design (no visit linkage); the contractor controls the cadence.
//
// Industry pattern: Jobber / Housecall Pro recurring billing ("bill per visit" vs "flat amount").
export const POST: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canCreateInvoice(auth.member)) error(403, 'Forbidden');

	const jobId = event.params.id!;

	const result = await db.transaction(async (tx) => {
		// Lock the job — serializes concurrent generate presses for the same job.
		const [job] = await tx.execute<{
			id: string;
			contact_id: string;
			opportunity_id: string | null;
			title: string;
			tax_rate: string;
			total: string;
			billing_type: string | null;
			fixed_invoice_amount: string | null;
		}>(sql`
			SELECT id, contact_id, opportunity_id, title, tax_rate, total,
			       billing_type, fixed_invoice_amount
			FROM jobs
			WHERE id = ${jobId} AND org_id = ${auth.orgId} AND deleted_at IS NULL
			FOR UPDATE
		`);
		if (!job) throw error(404, 'Job not found');
		if (!job.billing_type) {
			throw error(422, 'Set up recurring billing on this job before generating an invoice.');
		}

		// Build the invoice line(s) first so we can 422 cleanly before allocating a number.
		let lines: { description: string; unit_price: string; total: string; position: number }[];
		let invoiceTaxRate: string;
		let billedVisitIds: string[] = [];

		if (job.billing_type === 'visit_based') {
			const perVisit = Number(job.total);
			if (!(perVisit > 0)) {
				throw error(
					422,
					'Add line items to the job to set the per-visit price before invoicing.'
				);
			}
			// Past, non-cancelled visits not yet rolled into an invoice.
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
						eq(appointments.org_id, auth.orgId),
						isNull(appointments.deleted_at),
						isNull(appointments.billed_invoice_id),
						ne(appointments.status, 'cancelled'),
						lte(appointments.scheduled_start, new Date())
					)
				)
				.orderBy(asc(appointments.scheduled_start));

			if (visits.length === 0) {
				throw error(422, 'No unbilled visits to invoice yet.');
			}

			const perVisitStr = perVisit.toFixed(2);
			invoiceTaxRate = job.tax_rate;
			billedVisitIds = visits.map((v) => v.id);
			lines = visits.map((v, idx) => ({
				// Date suffix (UTC calendar date) keeps each visit line distinguishable.
				// Non-null: the query filters scheduled_start <= now(), excluding unscheduled visits.
				description: `${v.title} — ${v.scheduled_start!.toISOString().slice(0, 10)}`,
				unit_price: perVisitStr,
				total: perVisitStr,
				position: idx
			}));
		} else {
			// fixed
			const amount = Number(job.fixed_invoice_amount);
			if (!(amount > 0)) {
				throw error(422, 'Set the fixed invoice amount on this job before invoicing.');
			}
			const amountStr = amount.toFixed(2);
			// Flat amount is tax-inclusive (like a milestone) — no separate tax rate.
			invoiceTaxRate = '0';
			lines = [{ description: job.title, unit_price: amountStr, total: amountStr, position: 0 }];
		}

		// Allocate invoice number (self-heal a missing counter row before locking).
		await tx.execute(sql`
			INSERT INTO org_counters (org_id) VALUES (${auth.orgId})
			ON CONFLICT (org_id) DO NOTHING
		`);
		const [counter] = await tx.execute<{ next_invoice_number: number }>(sql`
			SELECT next_invoice_number FROM org_counters WHERE org_id = ${auth.orgId} FOR UPDATE
		`);
		if (!counter) throw new Error('Org counter missing');
		const invoiceNumber = counter.next_invoice_number;
		await tx
			.update(orgCounters)
			.set({ next_invoice_number: invoiceNumber + 1, updated_at: new Date() })
			.where(eq(orgCounters.org_id, auth.orgId));

		const rawToken = generateToken();
		const lf = await orgLateFeeSnapshot(tx, auth.orgId);

		const [inserted] = await tx
			.insert(invoices)
			.values({
				org_id: auth.orgId,
				contact_id: job.contact_id,
				job_id: job.id,
				opportunity_id: job.opportunity_id,
				issued_by: auth.member.id,
				invoice_number: invoiceNumber,
				title: job.title,
				status: 'draft',
				tax_rate: invoiceTaxRate,
				late_fee_enabled: lf.late_fee_enabled,
				late_fee_type: lf.late_fee_type,
				late_fee_value: lf.late_fee_value,
				public_token: rawToken
			})
			.returning();

		await tx.insert(invoiceLineItems).values(
			lines.map((l) => ({
				org_id: auth.orgId,
				invoice_id: inserted.id,
				description: l.description,
				quantity: '1',
				unit_price: l.unit_price,
				total: l.total,
				position: l.position
			}))
		);
		await recalcInvoiceTotals(tx, inserted.id);

		// Stamp the billed visits so they can never be invoiced again (visit-based only).
		if (billedVisitIds.length > 0) {
			await tx
				.update(appointments)
				.set({ billed_invoice_id: inserted.id, updated_at: new Date() })
				.where(inArray(appointments.id, billedVisitIds));
		}

		return { id: inserted.id, invoice_number: invoiceNumber, visit_count: billedVisitIds.length };
	});

	return json(
		{
			data: {
				id: result.id,
				invoice_number_display: formatInvoiceNumber(result.invoice_number),
				visit_count: result.visit_count
			}
		},
		{ status: 201 }
	);
};
