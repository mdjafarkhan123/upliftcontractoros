import { json, error } from '@sveltejs/kit';
import { eq, sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { contacts, invoices, outboxEvents } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canSendInvoice } from '$lib/server/invoices/permissions';
import { formatCurrencyUsd, formatInvoiceNumber } from '$lib/server/invoices/format';
import { invoiceSentEvent } from '$lib/server/invoices/events';
import { generateToken } from '$lib/server/quotes/token';

export const POST: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canSendInvoice(auth.member)) error(403, 'Forbidden');

	const id = event.params.id!;

	const result = await db.transaction(async (tx) => {
		const [existing] = await tx.execute<{
			id: string;
			status: string;
			contact_id: string;
			total: string;
			amount_due: string;
			invoice_number: number;
			due_date: string | null;
			stripe_payment_link_url: string | null;
			public_token: string | null;
		}>(sql`
			SELECT id, status, contact_id, total, amount_due, invoice_number, due_date,
			       stripe_payment_link_url, public_token
			FROM invoices
			WHERE id = ${id} AND org_id = ${auth.orgId} AND deleted_at IS NULL
			FOR UPDATE
		`);
		if (!existing) throw error(404, 'Invoice not found');
		if (existing.status !== 'draft') {
			throw error(422, 'Only draft invoices can be sent');
		}

		const [lineCount] = await tx.execute<{ c: number }>(sql`
			SELECT COUNT(*)::int AS c FROM invoice_line_items
			WHERE invoice_id = ${id} AND deleted_at IS NULL
		`);
		if (!lineCount || lineCount.c === 0) {
			throw error(422, 'Add at least one line item before sending');
		}

		const sentAt = new Date();

		// Use the invoice's stable public token. Lazily generate for legacy rows.
		let rawToken = existing.public_token;
		const updates: Record<string, unknown> = { status: 'sent', sent_at: sentAt, updated_at: sentAt };
		if (!rawToken) {
			rawToken = generateToken();
			updates.public_token = rawToken;
		}

		await tx
			.update(invoices)
			.set(updates)
			.where(eq(invoices.id, id));

		const [contactRow] = await tx
			.select({ email: contacts.email })
			.from(contacts)
			.where(eq(contacts.id, existing.contact_id))
			.limit(1);

		await tx.insert(outboxEvents).values(
			invoiceSentEvent({
				orgId: auth.orgId,
				invoiceId: existing.id,
				contactId: existing.contact_id,
				hasEmail: Boolean(contactRow?.email),
				totalFormatted: formatCurrencyUsd(existing.total),
				amountDueFormatted: formatCurrencyUsd(existing.amount_due),
				invoiceNumberDisplay: formatInvoiceNumber(existing.invoice_number),
				publicToken: rawToken,
				paymentLinkUrl: existing.stripe_payment_link_url,
				dueDate: existing.due_date
			})
		);

		return { id: existing.id, sentAt };
	});

	return json({
		data: {
			id: result.id,
			status: 'sent',
			sent_at: result.sentAt.toISOString()
		}
	});
};
