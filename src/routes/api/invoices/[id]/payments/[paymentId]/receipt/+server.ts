import { json, error } from '@sveltejs/kit';
import { sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { outboxEvents, payments } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canRecordPayment } from '$lib/server/invoices/permissions';
import { sendReceiptSchema } from '$lib/server/invoices/schemas';
import { paymentReceiptRequestedEvent } from '$lib/server/invoices/events';
import { formatCurrencyUsd, formatInvoiceNumber } from '$lib/server/invoices/format';
import { PAYMENT_METHOD_LABELS } from '$lib/utils/invoices';
import type { PaymentMethod } from '$lib/types/invoices';

// Send (or re-send) a receipt for one recorded payment over the chosen channel(s). Reuses the
// shared NotifyDialog on the client for the picker + editable copy. Stamps receipt_sent_at/
// receipt_sent_via at request time (same semantics as invoice sent_at) and emits the
// payment.receipt_requested outbox event that the automation worker delivers.
export const POST: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canRecordPayment(auth.member)) error(403, 'Forbidden');

	const invoiceId = event.params.id!;
	const paymentId = event.params.paymentId!;

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const parsed = sendReceiptSchema.safeParse(body);
	if (!parsed.success) {
		const field_errors: Record<string, string> = {};
		for (const issue of parsed.error.issues) {
			const key = issue.path[0];
			if (typeof key === 'string' && !field_errors[key]) field_errors[key] = issue.message;
		}
		return json({ error: 'Please fix the highlighted fields', field_errors }, { status: 422 });
	}
	const input = parsed.data;

	// One read for everything the receipt needs: the payment, its invoice + token, and the contact's
	// reachability. FOR UPDATE on the payment so a concurrent edit/delete can't race the stamp.
	const [row] = await db.execute<{
		payment_id: string;
		amount: string;
		tip_amount: string;
		adjustment_type: string;
		payment_method: string;
		paid_at: string;
		contact_id: string;
		contact_email: string | null;
		contact_sms_opt_out: boolean;
		invoice_number: number;
		public_token: string | null;
	}>(sql`
		SELECT p.id AS payment_id, p.amount, p.tip_amount, p.adjustment_type, p.payment_method, p.paid_at,
		       i.contact_id, c.email AS contact_email, c.sms_opt_out AS contact_sms_opt_out,
		       i.invoice_number, i.public_token
		FROM payments p
		JOIN invoices i ON i.id = p.invoice_id
		JOIN contacts c ON c.id = i.contact_id
		WHERE p.id = ${paymentId} AND p.invoice_id = ${invoiceId} AND p.org_id = ${auth.orgId}
		  AND i.deleted_at IS NULL
	`);
	if (!row) error(404, 'Payment not found');
	if (row.adjustment_type !== 'payment' || Number(row.amount) <= 0) {
		throw error(422, 'Receipts can only be sent for original payments');
	}

	// Reachability — return the channel-scoped field_errors the NotifyDialog maps to an inline error.
	if (input.channels.includes('email') && !row.contact_email) {
		return json(
			{
				error: 'This customer has no email address — choose Text instead.',
				field_errors: { channels: 'No email on file for this customer' }
			},
			{ status: 422 }
		);
	}
	if (input.channels.includes('sms') && row.contact_sms_opt_out) {
		return json(
			{
				error: 'This customer opted out of texts — choose Email instead.',
				field_errors: { channels: 'This customer opted out of texts' }
			},
			{ status: 422 }
		);
	}

	const via = input.channels.join(', ');
	const tip = Number(row.tip_amount);

	await db.transaction(async (tx) => {
		await tx
			.update(payments)
			.set({ receipt_sent_at: new Date(), receipt_sent_via: via })
			.where(sql`${payments.id} = ${paymentId}`);

		await tx.insert(outboxEvents).values(
			paymentReceiptRequestedEvent({
				orgId: auth.orgId,
				invoiceId,
				paymentId,
				contactId: row.contact_id,
				amountFormatted: formatCurrencyUsd(row.amount),
				tipFormatted: tip > 0 ? formatCurrencyUsd(row.tip_amount) : null,
				methodLabel: PAYMENT_METHOD_LABELS[row.payment_method as PaymentMethod] ?? 'Payment',
				paidAtIso: new Date(row.paid_at).toISOString(),
				invoiceNumberDisplay: formatInvoiceNumber(row.invoice_number),
				publicToken: row.public_token,
				channels: input.channels,
				smsBody: input.sms_body ?? null,
				emailSubject: input.email_subject ?? null,
				emailBody: input.email_body ?? null
			})
		);
	});

	return json({ data: { id: invoiceId, payment_id: paymentId, receipt_sent_via: via } });
};
