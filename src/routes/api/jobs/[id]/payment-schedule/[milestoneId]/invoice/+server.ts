import { json, error } from '@sveltejs/kit';
import { eq, sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import {
	invoiceLineItems,
	invoices,
	jobPaymentMilestones,
	orgCounters
} from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canCreateInvoice } from '$lib/server/invoices/permissions';
import { generateToken } from '$lib/server/quotes/token';
import { recalcInvoiceTotals } from '$lib/server/invoices/recalc';
import { orgLateFeeSnapshot } from '$lib/server/invoices/lateFee';
import { formatInvoiceNumber } from '$lib/server/invoices/format';

// Turn ONE payment-schedule milestone into a real invoice ("Create" on the Billing card).
// Unlike convert-to-invoice (which snapshots every job line), a milestone invoice is a single
// flat, tax-inclusive line whose total equals the milestone's share of the job total — so the
// splits always sum to the job total regardless of rounding. Idempotent: a milestone that
// already has an invoice returns it. Industry pattern: Jobber/Housecall Pro progress billing.
export const POST: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canCreateInvoice(auth.member)) error(403, 'Forbidden');

	const jobId = event.params.id!;
	const milestoneId = event.params.milestoneId!;

	const result = await db.transaction(async (tx) => {
		// Lock the milestone, joined to its job for the live total + invoice context.
		const [row] = await tx.execute<{
			milestone_id: string;
			description: string;
			amount_type: string;
			amount_value: string;
			due_date: string | null;
			invoice_id: string | null;
			milestone_deleted: string | null;
			job_id: string;
			contact_id: string;
			opportunity_id: string | null;
			title: string;
			total: string;
		}>(sql`
			SELECT m.id AS milestone_id, m.description, m.amount_type, m.amount_value, m.due_date,
			       m.invoice_id, m.deleted_at AS milestone_deleted,
			       j.id AS job_id, j.contact_id, j.opportunity_id, j.title, j.total
			FROM job_payment_milestones m
			JOIN jobs j ON j.id = m.job_id
			WHERE m.id = ${milestoneId}
			  AND m.job_id = ${jobId}
			  AND m.org_id = ${auth.orgId}
			  AND j.deleted_at IS NULL
			FOR UPDATE OF m
		`);
		if (!row || row.milestone_deleted) throw error(404, 'Payment milestone not found');

		// Already invoiced → return it (idempotent against double-clicks / retries).
		if (row.invoice_id) {
			const [existing] = await tx
				.select({ id: invoices.id, invoice_number: invoices.invoice_number })
				.from(invoices)
				.where(eq(invoices.id, row.invoice_id))
				.limit(1);
			if (existing) {
				return { existing: true, id: existing.id, invoice_number: existing.invoice_number };
			}
		}

		// Compute this milestone's dollar amount from the LIVE job total. Percent rows are a
		// share of the total; fixed rows are the amount as entered. Rounded to cents.
		const jobTotal = Number(row.total);
		const value = Number(row.amount_value);
		const amount =
			row.amount_type === 'percent'
				? Math.round(jobTotal * value) / 100 // value is a percentage (e.g. 50 → 50%)
				: value;
		if (!(amount > 0)) {
			throw error(422, 'This payment works out to $0. Add line items to the job or set an amount.');
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

		const amountStr = amount.toFixed(2);
		const rawToken = generateToken();
		const lf = await orgLateFeeSnapshot(tx, auth.orgId);

		const [inserted] = await tx
			.insert(invoices)
			.values({
				org_id: auth.orgId,
				contact_id: row.contact_id,
				job_id: row.job_id,
				opportunity_id: row.opportunity_id,
				issued_by: auth.member.id,
				invoice_number: invoiceNumber,
				title: `${row.title} — ${row.description}`,
				status: 'draft',
				// Milestone invoices are tax-inclusive flat amounts — the job's tax already lives
				// inside the total being split, so the invoice carries no separate tax rate.
				tax_rate: '0',
				// Carry the milestone's due date onto the invoice so the contractor lands on a
				// fully pre-populated draft (client, job link, line, and due date all set).
				due_date: row.due_date,
				late_fee_enabled: lf.late_fee_enabled,
				late_fee_type: lf.late_fee_type,
				late_fee_value: lf.late_fee_value,
				public_token: rawToken
			})
			.returning();

		await tx.insert(invoiceLineItems).values({
			org_id: auth.orgId,
			invoice_id: inserted.id,
			description: row.description,
			quantity: '1',
			unit_price: amountStr,
			total: amountStr,
			position: 0
		});
		await recalcInvoiceTotals(tx, inserted.id);

		// Link the invoice back onto the milestone — this is what locks the row against edits.
		await tx
			.update(jobPaymentMilestones)
			.set({ invoice_id: inserted.id, updated_at: new Date() })
			.where(eq(jobPaymentMilestones.id, milestoneId));

		return { existing: false, id: inserted.id, invoice_number: invoiceNumber };
	});

	return json(
		{
			data: {
				id: result.id,
				invoice_number_display: formatInvoiceNumber(result.invoice_number),
				already_existed: result.existing
			}
		},
		{ status: result.existing ? 200 : 201 }
	);
};
