import { json, error } from '@sveltejs/kit';
import { z } from 'zod';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import {
	contacts,
	invoiceLineItems,
	invoices,
	orgCounters,
	organizations,
	outboxEvents
} from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { computeLineTotal, recalcInvoiceTotals } from '$lib/server/invoices/recalc';
import { formatCurrencyUsd, formatInvoiceNumber } from '$lib/server/invoices/format';
import { invoiceSentEvent } from '$lib/server/invoices/events';
import { generateToken } from '$lib/server/quotes/token';

const TEST_CONTACT_TAG = '__stripe_self_test';
const TEST_PHONE = '+15555550100'; // Twilio magic test number — never dials out
const TEST_AMOUNT = '1.00';

function assertAdmin(role: string): void {
	if (role !== 'admin') error(403, 'Admin only.');
}

const bodySchema = z
	.object({
		email: z.string().email().optional()
	})
	.strict();

export const POST: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	assertAdmin(auth.member.role);

	let body: unknown = {};
	if (event.request.headers.get('content-length') && event.request.headers.get('content-length') !== '0') {
		try {
			body = await event.request.json();
		} catch {
			return json({ error: 'Invalid JSON.' }, { status: 400 });
		}
	}
	const parsed = bodySchema.safeParse(body);
	if (!parsed.success) {
		return json({ error: 'Invalid email.' }, { status: 400 });
	}

	const [org] = await db
		.select({
			stripe_restricted_key: organizations.stripe_restricted_key,
			stripe_webhook_secret: organizations.stripe_webhook_secret,
			stripe_publishable_key: organizations.stripe_publishable_key,
			stripe_livemode: organizations.stripe_livemode
		})
		.from(organizations)
		.where(eq(organizations.id, auth.orgId))
		.limit(1);

	if (!org) error(404, 'Organization not found.');
	if (!org.stripe_restricted_key || !org.stripe_publishable_key || !org.stripe_webhook_secret) {
		return json({ error: 'Connect Stripe first before sending a test invoice.' }, { status: 422 });
	}
	if (org.stripe_livemode !== false) {
		// Hard guard: only allow self-test in test mode. Live keys must never auto-send a self-invoice.
		return json(
			{
				error:
					'Test invoices are only available in test mode. Switch to a Stripe test key to try the flow safely.'
			},
			{ status: 422 }
		);
	}

	const recipientEmail = parsed.data.email?.trim() || auth.member.email;
	if (!recipientEmail) {
		return json({ error: 'No recipient email available.' }, { status: 422 });
	}

	const result = await db.transaction(async (tx) => {
		// 1. Find or create the dedicated self-test contact for this org.
		const [existingContact] = await tx
			.select({ id: contacts.id })
			.from(contacts)
			.where(
				and(
					eq(contacts.org_id, auth.orgId),
					isNull(contacts.deleted_at),
					sql`${contacts.tags} @> ARRAY[${TEST_CONTACT_TAG}]::text[]`
				)
			)
			.limit(1);

		let contactId: string;
		if (existingContact) {
			contactId = existingContact.id;
			await tx
				.update(contacts)
				.set({
					email: recipientEmail,
					email_opt_in: true,
					updated_at: new Date()
				})
				.where(eq(contacts.id, contactId));
		} else {
			const [created] = await tx
				.insert(contacts)
				.values({
					org_id: auth.orgId,
					full_name: 'Stripe Test (you)',
					email: recipientEmail,
					phone: TEST_PHONE,
					status: 'customer',
					lead_source: 'manual',
					email_opt_in: true,
					sms_opt_out: true,
					tags: [TEST_CONTACT_TAG],
					notes: 'Auto-created from Stripe settings to test the payment flow. Safe to delete after testing.'
				})
				.returning({ id: contacts.id });
			contactId = created.id;
		}

		// 2. Reserve next invoice number.
		const [counter] = await tx.execute<{ next_invoice_number: number }>(sql`
			SELECT next_invoice_number FROM org_counters WHERE org_id = ${auth.orgId} FOR UPDATE
		`);
		if (!counter) throw new Error('Org counter missing');
		const invoiceNumber = counter.next_invoice_number;
		await tx
			.update(orgCounters)
			.set({ next_invoice_number: invoiceNumber + 1, updated_at: new Date() })
			.where(eq(orgCounters.org_id, auth.orgId));

		// 3. Create the invoice (sent immediately).
		const rawToken = generateToken();
		const sentAt = new Date();
		const [inserted] = await tx
			.insert(invoices)
			.values({
				org_id: auth.orgId,
				contact_id: contactId,
				issued_by: auth.member.id,
				invoice_number: invoiceNumber,
				title: 'Stripe test payment',
				status: 'sent',
				tax_rate: '0',
				notes: 'This is a $1.00 test invoice sent from your Stripe settings. Pay it with Stripe test card 4242 4242 4242 4242 to confirm the full flow works.',
				public_token: rawToken,
				sent_at: sentAt
			})
			.returning();

		// 4. Add the single line item.
		await tx.insert(invoiceLineItems).values({
			org_id: auth.orgId,
			invoice_id: inserted.id,
			description: 'Stripe test payment — safe to ignore',
			quantity: '1',
			unit_price: TEST_AMOUNT,
			total: computeLineTotal(1, Number(TEST_AMOUNT)),
			position: 0
		});

		await recalcInvoiceTotals(tx, inserted.id);

		const [finalRow] = await tx
			.select({
				id: invoices.id,
				total: invoices.total,
				amount_due: invoices.amount_due,
				invoice_number: invoices.invoice_number,
				due_date: invoices.due_date
			})
			.from(invoices)
			.where(eq(invoices.id, inserted.id))
			.limit(1);

		// 5. Fire the invoice.sent outbox event so the contractor receives the email.
		await tx.insert(outboxEvents).values(
			invoiceSentEvent({
				orgId: auth.orgId,
				invoiceId: finalRow.id,
				contactId,
				hasEmail: true,
				totalFormatted: formatCurrencyUsd(finalRow.total),
				amountDueFormatted: formatCurrencyUsd(finalRow.amount_due),
				invoiceNumberDisplay: formatInvoiceNumber(finalRow.invoice_number),
				publicToken: rawToken,
				paymentLinkUrl: null,
				dueDate: finalRow.due_date
			})
		);

		return {
			invoiceId: finalRow.id,
			invoiceNumber: finalRow.invoice_number,
			publicToken: rawToken,
			recipientEmail
		};
	});

	const origin = event.url.origin;
	const publicUrl = `${origin}/i/${result.publicToken}`;

	console.log(
		JSON.stringify({
			level: 'info',
			event: 'settings.stripe.test_invoice.sent',
			org_id: auth.orgId,
			member_id: auth.member.id,
			invoice_id: result.invoiceId,
			recipient_email: result.recipientEmail
		})
	);

	return json({
		data: {
			invoice_id: result.invoiceId,
			invoice_number_display: formatInvoiceNumber(result.invoiceNumber),
			public_url: publicUrl,
			recipient_email: result.recipientEmail
		}
	});
};
