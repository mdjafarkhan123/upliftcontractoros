import { error } from '@sveltejs/kit';
import { eq, sql } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { contacts, invoices, organizations, outboxEvents } from '$lib/server/db/schema';
import { formatCurrencyUsd, formatInvoiceNumber } from '$lib/server/invoices/format';
import { invoicePaidEvent, invoiceSentEvent } from '$lib/server/invoices/events';
import type { SendInvoiceInput } from '$lib/server/invoices/schemas';
import { generateToken } from '$lib/server/quotes/token';
import { createInvoicePaymentLink, getOrgStripeClient, toCents } from '$lib/server/invoices/stripe';
import { canContactReceiveCommunication } from '$lib/server/communication-preferences';

/**
 * Deliver a single invoice to its client — the shared body behind BOTH the
 * per-invoice `POST /api/invoices/[id]/send` route and the bulk
 * `POST /api/invoices/batch-deliver` route (Rule 24: two proven callers).
 *
 * Owns the three-phase send: (A) read-only validation, (B) Stripe Payment Link
 * created OUTSIDE any transaction (Rule 8), (C) atomic status flip + outbox emit.
 * Permission checks stay in the caller; this trusts `orgId`.
 *
 * Throws a SvelteKit `error(...)` (HttpError) on any invalid state — a paid /
 * written-off invoice, no line items, or an unreachable channel — so a batch caller
 * can catch it per-invoice and record the reason without rolling back the others.
 */
export async function sendInvoice(
	orgId: string,
	id: string,
	send: SendInvoiceInput | null
): Promise<{ id: string; status: string; sent_at: Date }> {
	// Phase A — read-only validation. No tx yet; Stripe call must run outside any tx.
	const [existing] = await db
		.select({
			id: invoices.id,
			status: invoices.status,
			contact_id: invoices.contact_id,
			total: invoices.total,
			amount_due: invoices.amount_due,
			invoice_number: invoices.invoice_number,
			due_date: invoices.due_date,
			stripe_payment_link_url: invoices.stripe_payment_link_url,
			stripe_payment_link_id: invoices.stripe_payment_link_id,
			public_token: invoices.public_token
		})
		.from(invoices)
		.where(
			sql`${invoices.id} = ${id} AND ${invoices.org_id} = ${orgId} AND ${invoices.deleted_at} IS NULL`
		)
		.limit(1);

	if (!existing) error(404, 'Invoice not found');
	// Send (draft) OR re-send (sent_not_due / awaiting_payment / past_due) — the same delivery path.
	// Only a paid or written-off (bad_debt) invoice can't be sent.
	if (existing.status === 'paid' || existing.status === 'bad_debt') {
		error(422, 'Paid or written-off invoices can’t be sent');
	}

	const [lineCount] = await db.execute<{ c: number }>(sql`
		SELECT COUNT(*)::int AS c FROM invoice_line_items
		WHERE invoice_id = ${id} AND deleted_at IS NULL
	`);
	if (!lineCount || lineCount.c === 0) {
		error(422, 'Add at least one line item before sending');
	}

	// When channels were chosen, pre-validate they're actually deliverable for this contact.
	// The worker still hard-blocks SMS on opt-out as a final net.
	if (send) {
		const [reach] = await db.execute<{ contact_id: string }>(sql`
			SELECT i.contact_id
			FROM invoices i JOIN contacts c ON c.id = i.contact_id
			WHERE i.id = ${id} AND i.org_id = ${orgId} AND i.deleted_at IS NULL
		`);
		if (reach) {
			const results = await Promise.all(
				send.channels.map((channel) =>
					canContactReceiveCommunication({
						orgId,
						contactId: reach.contact_id,
						channel,
						direction: 'outbound',
						category: 'invoice_send'
					})
				)
			);
			const blocked = results.find((result) => !result.allowed);
			if (blocked) error(422, blocked.reasonMessage ?? 'This communication is blocked.');
		}
	}

	const [orgRow] = await db
		.select({ stripe_restricted_key: organizations.stripe_restricted_key })
		.from(organizations)
		.where(eq(organizations.id, orgId))
		.limit(1);

	// Phase B — generate Stripe Payment Link OUTSIDE the transaction (Rule 8).
	// Best-effort: a Stripe outage must not block the send. Customers can still pay
	// via the canonical /i/[token] link; the Payment Link is only a redundant fallback.
	let newPaymentLinkUrl: string | null = null;
	let newPaymentLinkId: string | null = null;
	const amountDueCents = toCents(existing.amount_due);
	const shouldCreatePaymentLink =
		Boolean(orgRow?.stripe_restricted_key) &&
		!existing.stripe_payment_link_url &&
		amountDueCents > 0;

	if (shouldCreatePaymentLink) {
		try {
			const stripe = getOrgStripeClient(orgRow!.stripe_restricted_key);
			const link = await createInvoicePaymentLink({
				stripe,
				invoiceId: existing.id,
				orgId,
				invoiceNumberDisplay: formatInvoiceNumber(existing.invoice_number),
				amountDueCents
			});
			newPaymentLinkUrl = link.url;
			newPaymentLinkId = link.id;
		} catch (err) {
			console.error('[invoice-send] Stripe Payment Link creation failed:', err);
			// Continue without the fallback link.
		}
	}

	// Phase C — atomic state flip + outbox emit. Re-lock and re-check to guard
	// against a concurrent send between Phase A and here.
	return await db.transaction(async (tx) => {
		const [locked] = await tx.execute<{
			status: string;
			public_token: string | null;
			stripe_payment_link_url: string | null;
			amount_due: string;
			total: string;
			invoice_number: number;
			payment_id: string | null;
		}>(sql`
			SELECT status, public_token, stripe_payment_link_url, amount_due, total, invoice_number,
				(SELECT id FROM payments WHERE invoice_id = invoices.id AND amount > 0
				 ORDER BY paid_at DESC, created_at DESC LIMIT 1) AS payment_id
			FROM invoices
			WHERE id = ${id} AND org_id = ${orgId} AND deleted_at IS NULL
			FOR UPDATE
		`);
		if (!locked) throw error(404, 'Invoice not found');
		if (locked.status === 'paid' || locked.status === 'bad_debt') {
			throw error(422, 'Paid or written-off invoices can’t be sent');
		}

		const sentAt = new Date();
		const isFirstSend = locked.status === 'draft';
		// On first send the invoice leaves draft. Strict Jobber: sent_not_due when a due date is still
		// in the future, otherwise awaiting_payment (due-on-receipt / due today). The nightly sweep
		// later moves it to past_due. Mirror isEffectivelyOverdue's local-midnight date handling.
		let firstSendStatus: 'sent_not_due' | 'awaiting_payment' = 'awaiting_payment';
		if (isFirstSend && existing.due_date) {
			const due = new Date(existing.due_date);
			if (!Number.isNaN(due.getTime())) {
				const today = new Date();
				today.setHours(0, 0, 0, 0);
				due.setHours(0, 0, 0, 0);
				if (due.getTime() > today.getTime()) firstSendStatus = 'sent_not_due';
			}
		}

		let rawToken = locked.public_token;
		const isPaidAtSend = Number(locked.amount_due) <= 0.001;
		const nextStatus = isPaidAtSend ? 'paid' : firstSendStatus;
		const updates: Record<string, unknown> = { updated_at: sentAt };
		if (isFirstSend) {
			updates.status = nextStatus;
			updates.sent_at = sentAt;
			if (isPaidAtSend) updates.paid_at = sentAt;
		}
		if (!rawToken) {
			rawToken = generateToken();
			updates.public_token = rawToken;
		}

		const effectivePaymentLinkUrl = locked.stripe_payment_link_url ?? newPaymentLinkUrl;
		if (newPaymentLinkUrl && !locked.stripe_payment_link_url) {
			updates.stripe_payment_link_url = newPaymentLinkUrl;
			updates.stripe_payment_link_id = newPaymentLinkId;
		}

		await tx.update(invoices).set(updates).where(eq(invoices.id, id));

		const [contactRow] = await tx
			.select({ email: contacts.email })
			.from(contacts)
			.where(eq(contacts.id, existing.contact_id))
			.limit(1);

		await tx.insert(outboxEvents).values(
			invoiceSentEvent({
				orgId,
				invoiceId: existing.id,
				contactId: existing.contact_id,
				hasEmail: Boolean(contactRow?.email),
				totalFormatted: formatCurrencyUsd(existing.total),
				amountDueFormatted: formatCurrencyUsd(existing.amount_due),
				invoiceNumberDisplay: formatInvoiceNumber(existing.invoice_number),
				publicToken: rawToken,
				paymentLinkUrl: effectivePaymentLinkUrl,
				dueDate: existing.due_date,
				channels: send?.channels ?? null,
				smsBody: send?.sms_body ?? null,
				emailSubject: send?.email_subject ?? null,
				emailBody: send?.email_body ?? null
			})
		);

		if (isFirstSend && isPaidAtSend && locked.payment_id) {
			await tx
				.insert(outboxEvents)
				.values(
					invoicePaidEvent({
						orgId,
						invoiceId: existing.id,
						paymentId: locked.payment_id,
						totalFormatted: formatCurrencyUsd(locked.total),
						invoiceNumberDisplay: formatInvoiceNumber(locked.invoice_number)
					})
				)
				.onConflictDoNothing({ target: outboxEvents.idempotency_key });
		}

		return {
			id: existing.id,
			status: isFirstSend ? nextStatus : locked.status,
			sent_at: sentAt
		};
	});
}
