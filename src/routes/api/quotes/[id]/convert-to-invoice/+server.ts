import { json, error } from '@sveltejs/kit';
import { and, asc, eq, isNull, or, sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import {
	invoiceLineItems,
	invoices,
	orgCounters,
	outboxEvents,
	payments,
	quoteLineItems,
	quotes
} from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canCreateInvoice } from '$lib/server/invoices/permissions';
import { generateToken } from '$lib/server/quotes/token';
import { computeLineTotal, recalcInvoiceTotals } from '$lib/server/invoices/recalc';
import { orgLateFeeSnapshot } from '$lib/server/invoices/lateFee';
import { formatCurrencyUsd, formatInvoiceNumber } from '$lib/server/invoices/format';
import { formatQuoteNumber } from '$lib/server/quotes/format';
import { invoicePaidEvent, paymentRecordedEvent } from '$lib/server/invoices/events';

export const POST: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canCreateInvoice(auth.member)) error(403, 'Forbidden');

	const quoteId = event.params.id!;

	const result = await db.transaction(async (tx) => {
		// Lock the source quote and verify it is accepted.
		const [quote] = await tx.execute<{
			id: string;
			org_id: string;
			contact_id: string;
			opportunity_id: string | null;
			title: string;
			tax_rate: string;
			total: string;
			quote_number: number;
			status: string;
			notes: string | null;
			terms: string | null;
			discount_type: string;
			discount_value: string | null;
			discount_label: string | null;
			deposit_paid_amount: number;
			deposit_stripe_payment_intent_id: string | null;
			deposit_applied_invoice_id: string | null;
			accepted_package_id: string | null;
		}>(sql`
			SELECT id, org_id, contact_id, opportunity_id, title, tax_rate, total,
			       quote_number, status, notes, terms, discount_type, discount_value,
			       discount_label, deposit_paid_amount,
			       deposit_stripe_payment_intent_id, deposit_applied_invoice_id,
			       accepted_package_id
			FROM quotes
			WHERE id = ${quoteId} AND org_id = ${auth.orgId} AND deleted_at IS NULL
			FOR UPDATE
		`);
		if (!quote) throw error(404, 'Quote not found');
		if (quote.status !== 'accepted') {
			throw error(422, 'Only accepted quotes can be converted to an invoice');
		}

		// Check if an active invoice already exists for this quote (unique index guard).
		const [existing] = await tx.execute<{ id: string; invoice_number: number }>(sql`
			SELECT id, invoice_number FROM invoices
			WHERE quote_id = ${quoteId}
			  AND deleted_at IS NULL
			  AND status != 'cancelled'
			LIMIT 1
		`);
		if (existing) {
			// Return the existing invoice id so the UI can navigate to it.
			return { existing: true, id: existing.id, invoice_number: existing.invoice_number };
		}

		// Allocate invoice number. Self-heal a missing counter row (legacy orgs created
		// before org_counters was seeded at provisioning) before locking so conversion
		// never hard-fails. Counters default to 1, so a bare insert seeds correctly.
		await tx.execute(sql`
			INSERT INTO org_counters (org_id) VALUES (${auth.orgId})
			ON CONFLICT (org_id) DO NOTHING
		`);
		const [counter] = await tx.execute<{ next_invoice_number: number }>(sql`
			SELECT next_invoice_number FROM org_counters WHERE org_id = ${auth.orgId} FOR UPDATE
		`);
		if (!counter) throw new Error('Org counter missing');
		const invoiceNumber = counter.next_invoice_number;
		await tx
			.update(orgCounters)
			.set({ next_invoice_number: invoiceNumber + 1, updated_at: new Date() })
			.where(eq(orgCounters.org_id, auth.orgId));

		// Generate public token.
		const rawToken = generateToken();

		// Seed the invoice's late-fee terms from the company default (M8 Phase 2).
		const lf = await orgLateFeeSnapshot(tx, auth.orgId);

		// Create invoice as a snapshot of the accepted quote.
		const [inserted] = await tx
			.insert(invoices)
			.values({
				org_id: auth.orgId,
				contact_id: quote.contact_id,
				opportunity_id: quote.opportunity_id,
				quote_id: quote.id,
				issued_by: auth.member.id,
				invoice_number: invoiceNumber,
				title: quote.title,
				status: 'draft',
				tax_rate: quote.tax_rate,
				notes: quote.notes,
				// Carry the accepted quote's agreed T&C + discount so the invoice bills the same
				// price the customer signed off on. recalcInvoiceTotals recomputes discount_amount
				// from the snapshot lines (a fixed discount clamps to the new subtotal).
				terms: quote.terms,
				discount_type: quote.discount_type,
				discount_value: quote.discount_value,
				discount_label: quote.discount_label,
				late_fee_enabled: lf.late_fee_enabled,
				late_fee_type: lf.late_fee_type,
				late_fee_value: lf.late_fee_value,
				public_token: rawToken
			})
			.returning();

		// Snapshot quote line items into invoice line items.
		const sourceLines = await tx
			.select({
				description: quoteLineItems.description,
				details: quoteLineItems.details,
				quantity: quoteLineItems.quantity,
				unit: quoteLineItems.unit,
				unit_price: quoteLineItems.unit_price,
				taxable: quoteLineItems.taxable,
				unit_cost: quoteLineItems.unit_cost,
				source_catalog_item_id: quoteLineItems.source_catalog_item_id,
				total: quoteLineItems.total,
				position: quoteLineItems.position
			})
			.from(quoteLineItems)
			.where(
				and(
					eq(quoteLineItems.quote_id, quoteId),
					eq(quoteLineItems.org_id, auth.orgId),
					isNull(quoteLineItems.deleted_at),
					// Bill required lines plus only the optional add-ons the customer accepted.
					or(eq(quoteLineItems.is_optional, false), eq(quoteLineItems.accepted_selected, true)),
					// Good-Better-Best: on a tiered quote, bill ONLY the accepted tier's lines
					// (not all three packages). Null on a simple quote → no extra filter.
					quote.accepted_package_id
						? eq(quoteLineItems.package_id, quote.accepted_package_id)
						: undefined
				)
			)
			.orderBy(asc(quoteLineItems.position));

		if (sourceLines.length > 0) {
			await tx.insert(invoiceLineItems).values(
				sourceLines.map((li) => ({
					org_id: auth.orgId,
					invoice_id: inserted.id,
					// Invoice lines are single-text; fold the quote line's optional description in.
					description: li.details?.trim()
						? `${li.description}\n${li.details.trim()}`
						: li.description,
					quantity: li.quantity,
					unit: li.unit,
					unit_price: li.unit_price,
					// Carry the quote line's tax flag so a labor line stays untaxed on the invoice.
					taxable: li.taxable,
					// Carry cost snapshot + catalog link for invoice-side margin visibility.
					unit_cost: li.unit_cost,
					source_catalog_item_id: li.source_catalog_item_id,
					total: li.total,
					position: li.position
				}))
			);
			await recalcInvoiceTotals(tx, inserted.id);
		}

		// Apply paid quote deposit as a payment credit (first invoice only).
		if (
			quote.deposit_paid_amount > 0 &&
			quote.deposit_stripe_payment_intent_id &&
			quote.deposit_applied_invoice_id === null
		) {
			const amountStr = (quote.deposit_paid_amount / 100).toFixed(2);
			const quoteNumberDisplay = formatQuoteNumber(quote.quote_number);

			const [payment] = await tx
				.insert(payments)
				.values({
					org_id: auth.orgId,
					invoice_id: inserted.id,
					amount: amountStr,
					payment_method: 'stripe',
					stripe_payment_intent_id: quote.deposit_stripe_payment_intent_id,
					notes: `Deposit applied from Quote ${quoteNumberDisplay}`,
					recorded_by: null
				})
				.returning({ id: payments.id });

			await tx
				.update(quotes)
				.set({ deposit_applied_invoice_id: inserted.id, updated_at: new Date() })
				.where(eq(quotes.id, quoteId));

			await recalcInvoiceTotals(tx, inserted.id);

			const [after] = await tx.execute<{
				status: string;
				total: string;
				invoice_number: number;
			}>(sql`SELECT status, total, invoice_number FROM invoices WHERE id = ${inserted.id}`);

			await tx.insert(outboxEvents).values(
				paymentRecordedEvent({
					orgId: auth.orgId,
					invoiceId: inserted.id,
					paymentId: payment.id,
					amountFormatted: formatCurrencyUsd(amountStr),
					invoiceNumberDisplay: formatInvoiceNumber(after.invoice_number)
				})
			);

			if (after.status === 'paid') {
				await tx
					.insert(outboxEvents)
					.values(
						invoicePaidEvent({
							orgId: auth.orgId,
							invoiceId: inserted.id,
							paymentId: payment.id,
							totalFormatted: formatCurrencyUsd(after.total),
							invoiceNumberDisplay: formatInvoiceNumber(after.invoice_number)
						})
					)
					.onConflictDoNothing({ target: outboxEvents.idempotency_key });
			}
		}

		return { existing: false, id: inserted.id, invoice_number: invoiceNumber };
	});

	if (result.existing) {
		return json(
			{
				data: {
					id: result.id,
					invoice_number_display: formatInvoiceNumber(result.invoice_number),
					already_existed: true
				}
			},
			{ status: 200 }
		);
	}

	return json(
		{
			data: {
				id: result.id,
				invoice_number_display: formatInvoiceNumber(result.invoice_number),
				already_existed: false
			}
		},
		{ status: 201 }
	);
};
