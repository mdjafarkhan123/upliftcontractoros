import { json, error } from '@sveltejs/kit';
import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import {
	contacts,
	invoiceLineItems,
	invoices,
	orgMembers,
	payments
} from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canEditInvoice, canViewAnyInvoice } from '$lib/server/invoices/permissions';
import { updateInvoiceSchema } from '$lib/server/invoices/schemas';
import { formatInvoiceNumber } from '$lib/server/invoices/format';
import { computeLineTotal, recalcInvoiceTotals } from '$lib/server/invoices/recalc';

export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canViewAnyInvoice(auth.member)) error(403, 'Forbidden');

	const id = event.params.id!;
	const [row] = await db
		.select({
			id: invoices.id,
			invoice_number: invoices.invoice_number,
			title: invoices.title,
			status: invoices.status,
			subtotal: invoices.subtotal,
			tax_rate: invoices.tax_rate,
			tax_amount: invoices.tax_amount,
			total: invoices.total,
			amount_paid: invoices.amount_paid,
			amount_due: invoices.amount_due,
			notes: invoices.notes,
			due_date: invoices.due_date,
			stripe_payment_link_url: invoices.stripe_payment_link_url,
			sent_at: invoices.sent_at,
			paid_at: invoices.paid_at,
			created_at: invoices.created_at,
			updated_at: invoices.updated_at,
			contact_id: invoices.contact_id,
			contact_name: contacts.full_name,
			contact_phone: contacts.phone,
			contact_email: contacts.email,
			job_id: invoices.job_id,
			opportunity_id: invoices.opportunity_id,
			quote_id: invoices.quote_id
		})
		.from(invoices)
		.innerJoin(contacts, eq(contacts.id, invoices.contact_id))
		.where(and(eq(invoices.id, id), eq(invoices.org_id, auth.orgId), isNull(invoices.deleted_at)))
		.limit(1);

	if (!row) error(404, 'Invoice not found');

	const lineItems = await db
		.select({
			id: invoiceLineItems.id,
			description: invoiceLineItems.description,
			quantity: invoiceLineItems.quantity,
			unit_price: invoiceLineItems.unit_price,
			total: invoiceLineItems.total,
			position: invoiceLineItems.position
		})
		.from(invoiceLineItems)
		.where(
			and(
				eq(invoiceLineItems.invoice_id, id),
				eq(invoiceLineItems.org_id, auth.orgId),
				isNull(invoiceLineItems.deleted_at)
			)
		)
		.orderBy(asc(invoiceLineItems.position), asc(invoiceLineItems.created_at));

	const paymentsRows = await db
		.select({
			id: payments.id,
			amount: payments.amount,
			payment_method: payments.payment_method,
			stripe_payment_intent_id: payments.stripe_payment_intent_id,
			notes: payments.notes,
			recorded_by_name: orgMembers.full_name,
			paid_at: payments.paid_at,
			created_at: payments.created_at
		})
		.from(payments)
		.leftJoin(orgMembers, eq(orgMembers.id, payments.recorded_by))
		.where(and(eq(payments.invoice_id, id), eq(payments.org_id, auth.orgId)))
		.orderBy(desc(payments.paid_at));

	return json({
		data: {
			...row,
			invoice_number_display: formatInvoiceNumber(row.invoice_number),
			created_at: row.created_at.toISOString(),
			updated_at: row.updated_at.toISOString(),
			sent_at: row.sent_at?.toISOString() ?? null,
			paid_at: row.paid_at?.toISOString() ?? null,
			line_items: lineItems,
			payments: paymentsRows.map((p) => ({
				...p,
				paid_at: p.paid_at.toISOString(),
				created_at: p.created_at.toISOString()
			}))
		}
	});
};

export const PATCH: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canEditInvoice(auth.member)) error(403, 'Forbidden');

	const id = event.params.id!;

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const parsed = updateInvoiceSchema.safeParse(body);
	if (!parsed.success) {
		const field_errors: Record<string, string> = {};
		for (const issue of parsed.error.issues) {
			const p = issue.path.join('.');
			if (p && !field_errors[p]) field_errors[p] = issue.message;
		}
		return json(
			{ error: parsed.error.issues[0]?.message ?? 'Invalid input', field_errors },
			{ status: 422 }
		);
	}
	const input = parsed.data;

	await db.transaction(async (tx) => {
		const [existing] = await tx.execute<{ id: string; status: string }>(sql`
			SELECT id, status FROM invoices
			WHERE id = ${id} AND org_id = ${auth.orgId} AND deleted_at IS NULL
			FOR UPDATE
		`);
		if (!existing) throw error(404, 'Invoice not found');
		if (existing.status !== 'draft') {
			throw error(422, 'Only draft invoices can be edited');
		}

		const updates: Record<string, unknown> = { updated_at: new Date() };
		if (input.title !== undefined) updates.title = input.title;
		if (input.tax_rate !== undefined) updates.tax_rate = String(input.tax_rate);
		if (input.due_date !== undefined) updates.due_date = input.due_date;
		if (input.notes !== undefined) updates.notes = input.notes;

		await tx.update(invoices).set(updates).where(eq(invoices.id, id));

		if (input.line_items !== undefined) {
			await tx
				.update(invoiceLineItems)
				.set({ deleted_at: new Date(), updated_at: new Date() })
				.where(and(eq(invoiceLineItems.invoice_id, id), isNull(invoiceLineItems.deleted_at)));
			if (input.line_items.length > 0) {
				await tx.insert(invoiceLineItems).values(
					input.line_items.map((li, idx) => ({
						org_id: auth.orgId,
						invoice_id: id,
						description: li.description,
						quantity: String(li.quantity),
						unit_price: String(li.unit_price),
						total: computeLineTotal(li.quantity, li.unit_price),
						position: li.position ?? idx
					}))
				);
			}
			await recalcInvoiceTotals(tx, id);
		} else if (input.tax_rate !== undefined) {
			await recalcInvoiceTotals(tx, id);
		}
	});

	return json({ data: { id } });
};
