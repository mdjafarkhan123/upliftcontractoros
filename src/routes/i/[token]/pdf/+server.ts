import { json } from '@sveltejs/kit';
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
import {
	clientIpFrom,
	lookupValidInvoiceByToken,
	sha256Hex
} from '$lib/server/invoices/publicAccess';
import { rateLimit } from '$lib/server/quotes/rateLimit';
import { generateAndStoreInvoicePdf } from '$lib/server/invoices/pdf';
import { formatInvoiceNumber } from '$lib/server/invoices/format';

export const GET: RequestHandler = async (event) => {
	const ipHash = sha256Hex(clientIpFrom(event.request));
	const rl = await rateLimit('i.pdf', ipHash, 10, 60);
	if (!rl.ok) {
		return json({ error: 'Too many requests. Please wait a moment.' }, { status: 429 });
	}

	const token = event.params.token!;
	const result = await lookupValidInvoiceByToken(token);
	if (!result.ok) {
		return json({ error: 'Invoice no longer available' }, { status: 404 });
	}
	const invoice = result.invoice;

	const [row] = await db
		.select({
			invoice_row: invoices,
			contact: contacts,
			org: organizations
		})
		.from(invoices)
		.innerJoin(contacts, eq(contacts.id, invoices.contact_id))
		.innerJoin(organizations, eq(organizations.id, invoices.org_id))
		.where(and(eq(invoices.id, invoice.id), isNull(invoices.deleted_at)))
		.limit(1);
	if (!row) return json({ error: 'Invoice no longer available' }, { status: 404 });

	const lineItems = await db
		.select({
			description: invoiceLineItems.description,
			quantity: invoiceLineItems.quantity,
			unit_price: invoiceLineItems.unit_price,
			total: invoiceLineItems.total,
			taxable: invoiceLineItems.taxable
		})
		.from(invoiceLineItems)
		.where(
			and(
				eq(invoiceLineItems.invoice_id, invoice.id),
				eq(invoiceLineItems.is_late_fee, false),
				isNull(invoiceLineItems.deleted_at)
			)
		)
		.orderBy(asc(invoiceLineItems.position), asc(invoiceLineItems.created_at));

	const paymentRows = await db
		.select({
			amount: payments.amount,
			tip_amount: payments.tip_amount,
			payment_method: payments.payment_method,
			paid_at: payments.paid_at,
			notes: payments.notes
		})
		.from(payments)
		.where(eq(payments.invoice_id, invoice.id))
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
			id: row.invoice_row.id,
			invoice_number_display: formatInvoiceNumber(row.invoice_row.invoice_number),
			title: row.invoice_row.title,
			status: row.invoice_row.status,
			subtotal: row.invoice_row.subtotal,
			discount_type: row.invoice_row.discount_type,
			discount_value: row.invoice_row.discount_value,
			discount_amount: row.invoice_row.discount_amount,
			discount_label: row.invoice_row.discount_label,
			tax_rate: row.invoice_row.tax_rate,
			tax_amount: row.invoice_row.tax_amount,
			total: row.invoice_row.total,
			amount_paid: row.invoice_row.amount_paid,
			amount_due: row.invoice_row.amount_due,
			tip_total: row.invoice_row.tip_total,
			late_fee_total: row.invoice_row.late_fee_total,
			notes: row.invoice_row.notes,
			terms: row.invoice_row.terms,
			due_date: row.invoice_row.due_date,
			created_at: row.invoice_row.created_at
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
