import { json, error } from '@sveltejs/kit';
import { eq, sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { contacts, invoices, organizations, outboxEvents } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canSendInvoice } from '$lib/server/invoices/permissions';
import { formatCurrencyUsd, formatInvoiceNumber } from '$lib/server/invoices/format';
import { invoiceSentEvent } from '$lib/server/invoices/events';
import { sendInvoiceSchema } from '$lib/server/invoices/schemas';
import { generateToken } from '$lib/server/quotes/token';
import { createInvoicePaymentLink, getOrgStripeClient, toCents } from '$lib/server/invoices/stripe';

export const POST: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canSendInvoice(auth.member)) error(403, 'Forbidden');

	const id = event.params.id!;

	// Parse the optional channel/copy override. A bodyless POST (legacy / re-send button)
	// keeps the old behaviour: deliver on every available channel with the default copy.
	let send: import('$lib/server/invoices/schemas').SendInvoiceInput | null = null;
	try {
		const raw = await event.request.json();
		const parsed = sendInvoiceSchema.safeParse(raw);
		if (!parsed.success) {
			const fieldErrors: Record<string, string> = {};
			for (const issue of parsed.error.issues) {
				const key = issue.path[0];
				if (typeof key === 'string' && !fieldErrors[key]) fieldErrors[key] = issue.message;
			}
			return json(
				{ error: 'Please fix the highlighted fields', field_errors: fieldErrors },
				{ status: 422 }
			);
		}
		send = parsed.data;
	} catch {
		send = null;
	}

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
			sql`${invoices.id} = ${id} AND ${invoices.org_id} = ${auth.orgId} AND ${invoices.deleted_at} IS NULL`
		)
		.limit(1);

	if (!existing) error(404, 'Invoice not found');
	// Send (draft) OR re-send (sent / partially_paid / overdue) — the same delivery path. Only a
	// fully-paid or cancelled invoice can't be sent. A re-send after an edit regenerates the payment
	// link below (edits null a stale link) and re-notifies the customer, without resetting status.
	if (existing.status === 'paid' || existing.status === 'cancelled') {
		error(422, 'Paid or cancelled invoices can’t be sent');
	}

	const [lineCount] = await db.execute<{ c: number }>(sql`
		SELECT COUNT(*)::int AS c FROM invoice_line_items
		WHERE invoice_id = ${id} AND deleted_at IS NULL
	`);
	if (!lineCount || lineCount.c === 0) {
		error(422, 'Add at least one line item before sending');
	}

	// When channels were chosen, pre-validate they're actually deliverable for this contact
	// (clean field-error response). The worker still hard-blocks SMS on opt-out as a final net.
	if (send) {
		const [reach] = await db.execute<{ email: string | null; sms_opt_out: boolean }>(sql`
			SELECT c.email, c.sms_opt_out
			FROM invoices i JOIN contacts c ON c.id = i.contact_id
			WHERE i.id = ${id} AND i.org_id = ${auth.orgId} AND i.deleted_at IS NULL
		`);
		if (reach) {
			if (send.channels.includes('email') && !reach.email) {
				return json(
					{
						error: 'This customer has no email address — choose Text instead.',
						field_errors: { channels: 'No email on file for this customer' }
					},
					{ status: 422 }
				);
			}
			if (send.channels.includes('sms') && reach.sms_opt_out) {
				return json(
					{
						error: 'This customer opted out of texts — choose Email instead.',
						field_errors: { channels: 'This customer opted out of texts' }
					},
					{ status: 422 }
				);
			}
		}
	}

	const [orgRow] = await db
		.select({ stripe_restricted_key: organizations.stripe_restricted_key })
		.from(organizations)
		.where(eq(organizations.id, auth.orgId))
		.limit(1);

	// Phase B — generate Stripe Payment Link OUTSIDE the transaction (Rule #8).
	// Best-effort: a Stripe outage or error must not block the send. Customers
	// can still pay via the canonical /i/[token] link; the Payment Link is only
	// a redundant fallback for app downtime.
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
				orgId: auth.orgId,
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
	const result = await db.transaction(async (tx) => {
		const [locked] = await tx.execute<{
			status: string;
			public_token: string | null;
			stripe_payment_link_url: string | null;
		}>(sql`
			SELECT status, public_token, stripe_payment_link_url
			FROM invoices
			WHERE id = ${id} AND org_id = ${auth.orgId} AND deleted_at IS NULL
			FOR UPDATE
		`);
		if (!locked) throw error(404, 'Invoice not found');
		if (locked.status === 'paid' || locked.status === 'cancelled') {
			throw error(422, 'Paid or cancelled invoices can’t be sent');
		}

		const sentAt = new Date();
		const isFirstSend = locked.status === 'draft';

		// Use the stable public token; lazily mint for legacy rows.
		let rawToken = locked.public_token;
		// First send flips draft → sent and stamps sent_at. A re-send keeps the current status and
		// the original sent_at (it's the "first delivered" date), only re-delivering the notification.
		const updates: Record<string, unknown> = { updated_at: sentAt };
		if (isFirstSend) {
			updates.status = 'sent';
			updates.sent_at = sentAt;
		}
		if (!rawToken) {
			rawToken = generateToken();
			updates.public_token = rawToken;
		}

		// Persist the newly created Payment Link, unless a concurrent caller
		// already populated one (preserve their value; ours becomes orphan).
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
				orgId: auth.orgId,
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

		return { id: existing.id, sentAt, status: isFirstSend ? 'sent' : locked.status };
	});

	return json({
		data: {
			id: result.id,
			status: result.status,
			sent_at: result.sentAt.toISOString()
		}
	});
};
