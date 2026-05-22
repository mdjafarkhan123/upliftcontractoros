import { json, error } from '@sveltejs/kit';
import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import {
	contacts,
	invoiceLineItems,
	invoices,
	organizations,
	payments
} from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canViewAnyInvoice } from '$lib/server/invoices/permissions';
import { generateAndStoreInvoicePdf } from '$lib/server/invoices/pdf';
import { formatInvoiceNumber } from '$lib/server/invoices/format';

export const POST: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canViewAnyInvoice(auth.member)) error(403, 'Forbidden');

	const id = event.params.id!;

	const [row] = await db
		.select({
			invoice: invoices,
			contact: contacts,
			org: organizations
		})
		.from(invoices)
		.innerJoin(contacts, eq(contacts.id, invoices.contact_id))
		.innerJoin(organizations, eq(organizations.id, invoices.org_id))
		.where(and(eq(invoices.id, id), eq(invoices.org_id, auth.orgId), isNull(invoices.deleted_at)))
		.limit(1);
	if (!row) error(404, 'Invoice not found');

	const lineItems = await db
		.select({
			description: invoiceLineItems.description,
			quantity: invoiceLineItems.quantity,
			unit_price: invoiceLineItems.unit_price,
			total: invoiceLineItems.total
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

	const paymentRows = await db
		.select({
			amount: payments.amount,
			payment_method: payments.payment_method,
			paid_at: payments.paid_at,
			notes: payments.notes
		})
		.from(payments)
		.where(eq(payments.invoice_id, id))
		.orderBy(desc(payments.paid_at));

	const { url } = await generateAndStoreInvoicePdf({
		org: {
			name: row.org.name,
			address: row.org.address,
			city: row.org.city,
			state: row.org.state,
			zip: row.org.zip,
			twilio_phone_number: row.org.twilio_phone_number
		},
		invoice: {
			id: row.invoice.id,
			invoice_number_display: formatInvoiceNumber(row.invoice.invoice_number),
			title: row.invoice.title,
			status: row.invoice.status,
			subtotal: row.invoice.subtotal,
			tax_rate: row.invoice.tax_rate,
			tax_amount: row.invoice.tax_amount,
			total: row.invoice.total,
			amount_paid: row.invoice.amount_paid,
			amount_due: row.invoice.amount_due,
			notes: row.invoice.notes,
			due_date: row.invoice.due_date,
			created_at: row.invoice.created_at
		},
		contact: {
			full_name: row.contact.full_name,
			email: row.contact.email,
			phone: row.contact.phone
		},
		lineItems,
		payments: paymentRows
	});

	return json({ data: { url, expires_in: 3600 } });
};
