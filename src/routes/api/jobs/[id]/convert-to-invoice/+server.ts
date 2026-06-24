import { json, error } from '@sveltejs/kit';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { invoiceLineItems, invoices, jobLineItems, orgCounters } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canCreateInvoice } from '$lib/server/invoices/permissions';
import { generateToken } from '$lib/server/quotes/token';
import { recalcInvoiceTotals } from '$lib/server/invoices/recalc';
import { formatInvoiceNumber } from '$lib/server/invoices/format';

// Create an invoice from a job (Jobber/Autopilot model: the invoice flows from the job's
// committed work). Snapshots the job's line items into invoice_line_items — independent copies,
// so editing the invoice never changes the job. Mirrors api/quotes/[id]/convert-to-invoice.
// Note: invoices carry no discount column, so a job-level discount is not transferred (same as
// the quote→invoice path); the invoice subtotal is the sum of line totals + the job's tax rate.
export const POST: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canCreateInvoice(auth.member)) error(403, 'Forbidden');

	const jobId = event.params.id!;

	const result = await db.transaction(async (tx) => {
		// Lock the source job.
		const [job] = await tx.execute<{
			id: string;
			org_id: string;
			contact_id: string;
			opportunity_id: string | null;
			title: string;
			tax_rate: string;
		}>(sql`
			SELECT id, org_id, contact_id, opportunity_id, title, tax_rate
			FROM jobs
			WHERE id = ${jobId} AND org_id = ${auth.orgId} AND deleted_at IS NULL
			FOR UPDATE
		`);
		if (!job) throw error(404, 'Job not found');

		// An active (non-cancelled) invoice already exists → return it (no duplicates).
		const [existing] = await tx.execute<{ id: string; invoice_number: number }>(sql`
			SELECT id, invoice_number FROM invoices
			WHERE job_id = ${jobId}
			  AND deleted_at IS NULL
			  AND status != 'cancelled'
			LIMIT 1
		`);
		if (existing) {
			return { existing: true, id: existing.id, invoice_number: existing.invoice_number };
		}

		const sourceLines = await tx
			.select({
				description: jobLineItems.description,
				details: jobLineItems.details,
				quantity: jobLineItems.quantity,
				unit_price: jobLineItems.unit_price,
				total: jobLineItems.total,
				position: jobLineItems.position
			})
			.from(jobLineItems)
			.where(
				and(
					eq(jobLineItems.job_id, jobId),
					eq(jobLineItems.org_id, auth.orgId),
					isNull(jobLineItems.deleted_at)
				)
			)
			.orderBy(asc(jobLineItems.position));

		if (sourceLines.length === 0) {
			throw error(422, 'Add at least one line item to the job before invoicing');
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
				tax_rate: job.tax_rate,
				public_token: rawToken
			})
			.returning();

		await tx.insert(invoiceLineItems).values(
			sourceLines.map((li) => ({
				org_id: auth.orgId,
				invoice_id: inserted.id,
				// Invoice lines are single-text; fold the job line's optional description in.
				description: li.details?.trim()
					? `${li.description}\n${li.details.trim()}`
					: li.description,
				quantity: li.quantity,
				unit_price: li.unit_price,
				total: li.total,
				position: li.position
			}))
		);
		await recalcInvoiceTotals(tx, inserted.id);

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
