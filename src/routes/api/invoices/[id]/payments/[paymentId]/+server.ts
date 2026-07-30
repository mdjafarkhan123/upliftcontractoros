import { json, error } from '@sveltejs/kit';
import { sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { outboxEvents, payments } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canRecordPayment } from '$lib/server/invoices/permissions';
import { recordPaymentSchema, refundPaymentSchema } from '$lib/server/invoices/schemas';
import { parsePaymentDate } from '$lib/server/invoices/paymentDate';
import { recalcInvoiceTotals } from '$lib/server/invoices/recalc';
import { formatCurrencyUsd, formatInvoiceNumber } from '$lib/server/invoices/format';
import { getOrgStripeClient, toCents } from '$lib/server/invoices/stripe';
import {
	paymentDeletedEvent,
	paymentRefundedEvent,
	paymentReversedEvent,
	paymentUpdatedEvent
} from '$lib/server/invoices/events';
import type { PaymentMethod } from '$lib/types/invoices';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

function fieldErrors(parsed: {
	error: { issues: readonly { path: readonly unknown[]; message: string }[] };
}) {
	const field_errors: Record<string, string> = {};
	for (const issue of parsed.error.issues) {
		const key = issue.path.map(String).join('.');
		if (key && !field_errors[key]) field_errors[key] = issue.message;
	}
	return json(
		{ error: parsed.error.issues[0]?.message ?? 'Invalid input', field_errors },
		{ status: 422 }
	);
}

async function lockInvoicePayment(tx: Tx, orgId: string, invoiceId: string, paymentId: string) {
	const [row] = await tx.execute<{
		invoice_status: string;
		amount_due: string;
		invoice_number: number;
		payment_id: string;
		amount: string;
		tip_amount: string;
		adjustment_type: string;
		payment_method: string;
		stripe_payment_intent_id: string | null;
		notes: string | null;
		paid_at: string;
	}>(sql`
		SELECT i.status AS invoice_status, i.amount_due, i.invoice_number,
		       p.id AS payment_id, p.amount, p.tip_amount, p.adjustment_type, p.payment_method,
		       p.stripe_payment_intent_id, p.notes, p.paid_at
		FROM invoices i
		JOIN payments p ON p.invoice_id = i.id AND p.org_id = i.org_id
		WHERE i.id = ${invoiceId} AND i.org_id = ${orgId} AND i.deleted_at IS NULL
		  AND p.id = ${paymentId}
		FOR UPDATE OF i, p
	`);
	if (!row) throw error(404, 'Payment not found');
	return row;
}

function isOnline(row: { payment_method: string; stripe_payment_intent_id: string | null }) {
	return row.payment_method === 'stripe' || Boolean(row.stripe_payment_intent_id);
}

export const PATCH: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canRecordPayment(auth.member)) error(403, 'Forbidden');
	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}
	const parsed = recordPaymentSchema.safeParse(body);
	if (!parsed.success) return fieldErrors(parsed);
	const input = parsed.data;
	const invoiceId = event.params.id!;
	const paymentId = event.params.paymentId!;

	const result = await db.transaction(async (tx) => {
		const row = await lockInvoicePayment(tx, auth.orgId, invoiceId, paymentId);
		if (isOnline(row)) throw error(422, 'Online payments can only be refunded through Stripe');
		if (row.adjustment_type !== 'payment') throw error(422, 'Payment adjustments cannot be edited');
		const maxAmount = Number(row.amount_due) + Number(row.amount);
		if (input.amount > maxAmount + 0.001) throw error(422, 'Payment exceeds the invoice balance');
		await tx
			.update(payments)
			.set({
				amount: input.amount.toFixed(2),
				tip_amount: (input.tip_amount ?? 0).toFixed(2),
				payment_method: input.payment_method,
				notes: input.notes ?? null,
				paid_at: parsePaymentDate(input.paid_at),
				receipt_sent_at: null,
				receipt_sent_via: null
			})
			.where(sql`${payments.id} = ${paymentId}`);
		await recalcInvoiceTotals(tx, invoiceId);
		await tx
			.insert(outboxEvents)
			.values(paymentUpdatedEvent({ orgId: auth.orgId, invoiceId, paymentId }));
		return { id: paymentId };
	});
	return json({ data: result });
};

export const DELETE: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canRecordPayment(auth.member)) error(403, 'Forbidden');
	const invoiceId = event.params.id!;
	const paymentId = event.params.paymentId!;
	await db.transaction(async (tx) => {
		const row = await lockInvoicePayment(tx, auth.orgId, invoiceId, paymentId);
		if (isOnline(row)) throw error(422, 'Online payments cannot be deleted; issue a Stripe refund');
		if (row.adjustment_type !== 'payment')
			throw error(422, 'Payment adjustments cannot be deleted');
		await tx.delete(payments).where(sql`${payments.id} = ${paymentId}`);
		await recalcInvoiceTotals(tx, invoiceId);
		await tx
			.insert(outboxEvents)
			.values(paymentDeletedEvent({ orgId: auth.orgId, invoiceId, paymentId }));
	});
	return new Response(null, { status: 204 });
};

export const POST: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canRecordPayment(auth.member)) error(403, 'Forbidden');

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}
	const parsed = refundPaymentSchema.safeParse(body);
	if (!parsed.success) return fieldErrors(parsed);
	const input = parsed.data;
	const invoiceId = event.params.id!;
	const paymentId = event.params.paymentId!;

	const [target] = await db.execute<{
		invoice_number: number;
		payment_method: string;
		stripe_payment_intent_id: string | null;
	}>(sql`
		SELECT i.invoice_number, p.payment_method, p.stripe_payment_intent_id
		FROM invoices i
		JOIN payments p ON p.invoice_id = i.id AND p.org_id = i.org_id
		WHERE i.id = ${invoiceId} AND i.org_id = ${auth.orgId} AND i.deleted_at IS NULL
		  AND p.id = ${paymentId}
	`);
	if (!target) error(404, 'Payment not found');

	if (!isOnline(target)) {
		const result = await db.transaction(async (tx) => {
			const row = await lockInvoicePayment(tx, auth.orgId, invoiceId, paymentId);
			if (row.adjustment_type !== 'payment')
				throw error(422, 'Only original payments can be reversed');

			const [remaining] = await tx.execute<{ amount: string; tip_amount: string }>(sql`
				SELECT
					(p.amount + COALESCE(SUM(adj.amount), 0))::numeric(12,2) AS amount,
					(p.tip_amount + COALESCE(SUM(adj.tip_amount), 0))::numeric(12,2) AS tip_amount
				FROM payments p
				LEFT JOIN payments adj ON adj.applies_to_payment_id = p.id
				WHERE p.id = ${paymentId}
				GROUP BY p.id
			`);
			const refundAmount = Number(input.amount.toFixed(2));
			const refundTip = Number((input.tip_amount ?? 0).toFixed(2));
			if (refundAmount > Number(remaining.amount) + 0.001)
				throw error(422, 'Reversal exceeds the remaining payment');
			if (refundTip > Number(remaining.tip_amount) + 0.001)
				throw error(422, 'Tip reversal exceeds the remaining tip');

			const [reversal] = await tx
				.insert(payments)
				.values({
					org_id: auth.orgId,
					invoice_id: invoiceId,
					amount: (-refundAmount).toFixed(2),
					tip_amount: (-refundTip).toFixed(2),
					adjustment_type: 'correction',
					applies_to_payment_id: paymentId,
					payment_method: row.payment_method as PaymentMethod,
					notes: input.notes ?? null,
					recorded_by: auth.member.id,
					paid_at: parsePaymentDate(input.paid_at)
				})
				.returning({ id: payments.id });
			await recalcInvoiceTotals(tx, invoiceId);
			await tx.insert(outboxEvents).values(
				paymentReversedEvent({
					orgId: auth.orgId,
					invoiceId,
					paymentId: reversal.id,
					originalPaymentId: paymentId,
					amountFormatted: formatCurrencyUsd((refundAmount + refundTip).toFixed(2)),
					invoiceNumberDisplay: formatInvoiceNumber(row.invoice_number)
				})
			);
			return { id: reversal.id };
		});
		return json({ data: result });
	}

	const [before] = await db.execute<{
		invoice_number: number;
		payment_method: string;
		stripe_payment_intent_id: string | null;
		stripe_secret_key: string | null;
		amount: string;
		tip_amount: string;
		remaining_amount: string;
		remaining_tip: string;
	}>(sql`
		SELECT i.invoice_number, p.payment_method, p.stripe_payment_intent_id,
		       o.stripe_restricted_key AS stripe_secret_key, p.amount, p.tip_amount,
		       (p.amount + COALESCE(SUM(adj.amount), 0))::numeric(12,2) AS remaining_amount,
		       (p.tip_amount + COALESCE(SUM(adj.tip_amount), 0))::numeric(12,2) AS remaining_tip
		FROM invoices i
		JOIN payments p ON p.invoice_id = i.id AND p.org_id = i.org_id
		JOIN organizations o ON o.id = i.org_id
		LEFT JOIN payments adj ON adj.applies_to_payment_id = p.id
		WHERE i.id = ${invoiceId} AND i.org_id = ${auth.orgId} AND i.deleted_at IS NULL
		  AND p.id = ${paymentId} AND p.adjustment_type = 'payment'
		GROUP BY i.invoice_number, p.id, o.stripe_restricted_key
	`);
	if (!before) error(404, 'Payment not found');
	if (!isOnline(before) || !before.stripe_payment_intent_id) {
		throw error(422, 'Only online Stripe payments can be refunded here');
	}
	const refundAmount = Number(input.amount.toFixed(2));
	const refundTip = Number((input.tip_amount ?? 0).toFixed(2));
	if (refundAmount > Number(before.remaining_amount) + 0.001)
		error(422, 'Refund exceeds the remaining payment');
	if (refundTip > Number(before.remaining_tip) + 0.001)
		error(422, 'Tip refund exceeds the remaining tip');
	if (!before.stripe_secret_key) error(422, 'Stripe is not connected for this organization');

	const stripe = getOrgStripeClient(before.stripe_secret_key);
	const stripeRefund = await stripe.refunds.create(
		{
			payment_intent: before.stripe_payment_intent_id,
			amount: toCents(refundAmount + refundTip),
			metadata: { invoice_id: invoiceId, payment_id: paymentId }
		},
		{
			idempotencyKey: `invoice-refund:${paymentId}:${refundAmount.toFixed(2)}:${refundTip.toFixed(2)}`
		}
	);

	const result = await db.transaction(async (tx) => {
		const row = await lockInvoicePayment(tx, auth.orgId, invoiceId, paymentId);
		if (!isOnline(row)) throw error(422, 'Only online Stripe payments can be refunded here');
		const [refund] = await tx
			.insert(payments)
			.values({
				org_id: auth.orgId,
				invoice_id: invoiceId,
				amount: (-refundAmount).toFixed(2),
				tip_amount: (-refundTip).toFixed(2),
				adjustment_type: 'refund',
				applies_to_payment_id: paymentId,
				payment_method: 'stripe',
				stripe_refund_id: stripeRefund.id,
				notes: input.notes ?? null,
				recorded_by: auth.member.id,
				paid_at: parsePaymentDate(input.paid_at)
			})
			.returning({ id: payments.id });
		await recalcInvoiceTotals(tx, invoiceId);
		await tx.insert(outboxEvents).values(
			paymentRefundedEvent({
				orgId: auth.orgId,
				invoiceId,
				paymentId: refund.id,
				originalPaymentId: paymentId,
				amountFormatted: formatCurrencyUsd((refundAmount + refundTip).toFixed(2)),
				invoiceNumberDisplay: formatInvoiceNumber(row.invoice_number)
			})
		);
		return { id: refund.id, stripe_refund_id: stripeRefund.id };
	});
	return json({ data: result });
};
