import { json, error } from '@sveltejs/kit';
import { sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { outboxEvents, payments } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canRecordPayment } from '$lib/server/invoices/permissions';
import { recordPaymentSchema } from '$lib/server/invoices/schemas';
import { parsePaymentDate } from '$lib/server/invoices/paymentDate';
import { recalcInvoiceTotals } from '$lib/server/invoices/recalc';
import { invoicePaidEvent, paymentRecordedEvent } from '$lib/server/invoices/events';
import { formatCurrencyUsd, formatInvoiceNumber } from '$lib/server/invoices/format';

export const POST: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canRecordPayment(auth.member)) error(403, 'Forbidden');

	const id = event.params.id!;

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const parsed = recordPaymentSchema.safeParse(body);
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

	const result = await db.transaction(async (tx) => {
		const [existing] = await tx.execute<{
			id: string;
			status: string;
			total: string;
			amount_due: string;
			invoice_number: number;
			tips_enabled: boolean;
			accept_tips: boolean;
		}>(sql`
			SELECT id, status, total, amount_due, invoice_number, accept_tips,
			       (SELECT tips_enabled FROM organizations WHERE id = ${auth.orgId}) AS tips_enabled
			FROM invoices
			WHERE id = ${id} AND org_id = ${auth.orgId} AND deleted_at IS NULL
			FOR UPDATE
		`);
		if (!existing) throw error(404, 'Invoice not found');
		if (existing.status === 'bad_debt')
			throw error(422, 'Reopen the written-off invoice before recording a payment');
		// Jobber allows staff to record money from the draft invoice screen. The ledger and
		// balance update now; recalc keeps the invoice status as draft until it is sent.

		const amountStr = input.amount.toFixed(2);
		if (Number(amountStr) > Number(existing.amount_due) + 0.001) {
			throw error(422, 'Payment exceeds amount due');
		}

		// Tip (M7) is EXTRA money on top of the balance — never checked against amount_due, and
		// only honored when the org has tips enabled (a stale client can't sneak one in).
		const tipStr = (
			existing.tips_enabled && existing.accept_tips ? (input.tip_amount ?? 0) : 0
		).toFixed(2);

		const paidAt = parsePaymentDate(input.paid_at);

		const [payment] = await tx
			.insert(payments)
			.values({
				org_id: auth.orgId,
				invoice_id: id,
				amount: amountStr,
				tip_amount: tipStr,
				payment_method: input.payment_method,
				notes: input.notes ?? null,
				recorded_by: auth.member.id,
				paid_at: paidAt
			})
			.returning({ id: payments.id });

		await recalcInvoiceTotals(tx, id);

		const [after] = await tx.execute<{
			id: string;
			status: string;
			total: string;
			amount_due: string;
		}>(sql`
			SELECT id, status, total, amount_due FROM invoices WHERE id = ${id}
		`);

		await tx.insert(outboxEvents).values(
			paymentRecordedEvent({
				orgId: auth.orgId,
				invoiceId: id,
				paymentId: payment.id,
				amountFormatted: formatCurrencyUsd(amountStr),
				invoiceNumberDisplay: formatInvoiceNumber(existing.invoice_number)
			})
		);

		if (after.status === 'paid') {
			// Idempotent: idempotency_key for invoice.paid is invoice-scoped, so concurrent
			// payment paths (manual + Stripe webhook race) cannot emit it twice.
			await tx
				.insert(outboxEvents)
				.values(
					invoicePaidEvent({
						orgId: auth.orgId,
						invoiceId: id,
						paymentId: payment.id,
						totalFormatted: formatCurrencyUsd(after.total),
						invoiceNumberDisplay: formatInvoiceNumber(existing.invoice_number)
					})
				)
				.onConflictDoNothing({ target: outboxEvents.idempotency_key });
		}

		return { paymentId: payment.id, status: after.status, amountDue: after.amount_due };
	});

	return json({
		data: {
			id,
			payment_id: result.paymentId,
			status: result.status,
			amount_due: result.amountDue
		}
	});
};
