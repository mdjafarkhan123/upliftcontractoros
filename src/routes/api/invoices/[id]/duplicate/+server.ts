import { json, error } from '@sveltejs/kit';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { contacts, invoiceLineItems, invoices, orgCounters } from '$lib/server/db/schema';
import { db } from '$lib/server/db/client';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canCreateInvoice } from '$lib/server/invoices/permissions';
import { generateToken } from '$lib/server/quotes/token';
import { recalcInvoiceTotals } from '$lib/server/invoices/recalc';
import { formatInvoiceNumber } from '$lib/server/invoices/format';

/** Clone an invoice into a fresh draft, without copying lifecycle or payment history. */
export const POST: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canCreateInvoice(auth.member)) error(403, 'Forbidden');

	const sourceId = event.params.id!;
	const created = await db.transaction(async (tx) => {
		const [source] = await tx
			.select({
				contact_id: invoices.contact_id,
				job_id: invoices.job_id,
				opportunity_id: invoices.opportunity_id,
				title: invoices.title,
				tax_rate: invoices.tax_rate,
				discount_type: invoices.discount_type,
				discount_value: invoices.discount_value,
				discount_label: invoices.discount_label,
				notes: invoices.notes,
				terms: invoices.terms,
				send_payment_reminders: invoices.send_payment_reminders,
				accept_tips: invoices.accept_tips,
				late_fee_enabled: invoices.late_fee_enabled,
				late_fee_type: invoices.late_fee_type,
				late_fee_value: invoices.late_fee_value
			})
			.from(invoices)
			.innerJoin(contacts, eq(contacts.id, invoices.contact_id))
			.where(
				and(eq(invoices.id, sourceId), eq(invoices.org_id, auth.orgId), isNull(invoices.deleted_at))
			)
			.limit(1);
		if (!source) throw error(404, 'Invoice not found');

		const sourceLines = await tx
			.select({
				description: invoiceLineItems.description,
				quantity: invoiceLineItems.quantity,
				unit: invoiceLineItems.unit,
				unit_price: invoiceLineItems.unit_price,
				taxable: invoiceLineItems.taxable,
				unit_cost: invoiceLineItems.unit_cost,
				source_catalog_item_id: invoiceLineItems.source_catalog_item_id,
				total: invoiceLineItems.total,
				position: invoiceLineItems.position
			})
			.from(invoiceLineItems)
			.where(
				and(
					eq(invoiceLineItems.invoice_id, sourceId),
					eq(invoiceLineItems.org_id, auth.orgId),
					eq(invoiceLineItems.is_late_fee, false),
					isNull(invoiceLineItems.deleted_at)
				)
			)
			.orderBy(asc(invoiceLineItems.position), asc(invoiceLineItems.created_at));

		await tx.execute(sql`
			INSERT INTO org_counters (org_id) VALUES (${auth.orgId})
			ON CONFLICT (org_id) DO NOTHING
		`);
		const [counter] = await tx.execute<{ next_invoice_number: number }>(sql`
			SELECT next_invoice_number FROM org_counters
			WHERE org_id = ${auth.orgId} FOR UPDATE
		`);
		if (!counter) throw new Error('Org counter missing');
		const invoiceNumber = counter.next_invoice_number;
		await tx
			.update(orgCounters)
			.set({ next_invoice_number: invoiceNumber + 1, updated_at: new Date() })
			.where(eq(orgCounters.org_id, auth.orgId));

		const [inserted] = await tx
			.insert(invoices)
			.values({
				org_id: auth.orgId,
				contact_id: source.contact_id,
				job_id: source.job_id,
				opportunity_id: source.opportunity_id,
				quote_id: null,
				issued_by: auth.member.id,
				invoice_number: invoiceNumber,
				title: `${source.title} (Copy)`,
				status: 'draft',
				tax_rate: source.tax_rate,
				discount_type: source.discount_type,
				discount_value: source.discount_value,
				discount_label: source.discount_label,
				notes: source.notes,
				terms: source.terms,
				send_payment_reminders: source.send_payment_reminders,
				accept_tips: source.accept_tips,
				late_fee_enabled: source.late_fee_enabled,
				late_fee_type: source.late_fee_type,
				late_fee_value: source.late_fee_value,
				public_token: generateToken()
			})
			.returning({ id: invoices.id });

		if (sourceLines.length > 0) {
			await tx.insert(invoiceLineItems).values(
				sourceLines.map((line) => ({
					org_id: auth.orgId,
					invoice_id: inserted.id,
					description: line.description,
					quantity: line.quantity,
					unit: line.unit,
					unit_price: line.unit_price,
					taxable: line.taxable,
					unit_cost: line.unit_cost,
					source_catalog_item_id: line.source_catalog_item_id,
					total: line.total,
					position: line.position
				}))
			);
		}
		await recalcInvoiceTotals(tx, inserted.id);
		return { id: inserted.id, invoice_number_display: formatInvoiceNumber(invoiceNumber) };
	});

	return json({ data: created });
};
