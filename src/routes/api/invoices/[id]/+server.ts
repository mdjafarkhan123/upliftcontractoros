import { json, error } from '@sveltejs/kit';
import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import {
	contacts,
	invoiceLineItems,
	invoices,
	orgMembers,
	organizations,
	payments
} from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canEditInvoice, canViewAnyInvoice } from '$lib/server/invoices/permissions';
import { updateInvoiceSchema } from '$lib/server/invoices/schemas';
import { formatCurrencyUsd, formatInvoiceNumber } from '$lib/server/invoices/format';
import { computeLineTotal, recalcInvoiceTotals } from '$lib/server/invoices/recalc';
import { deactivatePaymentLink, getOrgStripeClient } from '$lib/server/invoices/stripe';

export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canViewAnyInvoice(auth.member)) error(403, 'Forbidden');

	const id = event.params.id!;
	const [row] = await db
		.select({
			id: invoices.id,
			invoice_number: invoices.invoice_number,
			title: invoices.title,
			status: invoices.status,
			subtotal: invoices.subtotal,
			discount_type: invoices.discount_type,
			discount_value: invoices.discount_value,
			discount_amount: invoices.discount_amount,
			discount_label: invoices.discount_label,
			tax_rate: invoices.tax_rate,
			tax_amount: invoices.tax_amount,
			total: invoices.total,
			amount_paid: invoices.amount_paid,
			amount_due: invoices.amount_due,
			tip_total: invoices.tip_total,
			late_fee_total: invoices.late_fee_total,
			late_fee_enabled: invoices.late_fee_enabled,
			late_fee_type: invoices.late_fee_type,
			late_fee_value: invoices.late_fee_value,
			notes: invoices.notes,
			terms: invoices.terms,
			due_date: invoices.due_date,
			send_payment_reminders: invoices.send_payment_reminders,
			accept_tips: invoices.accept_tips,
			stripe_payment_link_url: invoices.stripe_payment_link_url,
			sent_at: invoices.sent_at,
			paid_at: invoices.paid_at,
			created_at: invoices.created_at,
			updated_at: invoices.updated_at,
			contact_id: invoices.contact_id,
			contact_name: contacts.full_name,
			contact_phone: contacts.phone,
			contact_email: contacts.email,
			contact_sms_opt_out: contacts.sms_opt_out,
			job_id: invoices.job_id,
			opportunity_id: invoices.opportunity_id,
			quote_id: invoices.quote_id
		})
		.from(invoices)
		.innerJoin(contacts, eq(contacts.id, invoices.contact_id))
		.where(and(eq(invoices.id, id), eq(invoices.org_id, auth.orgId), isNull(invoices.deleted_at)))
		.limit(1);

	if (!row) error(404, 'Invoice not found');

	const lineItems = await db
		.select({
			id: invoiceLineItems.id,
			description: invoiceLineItems.description,
			quantity: invoiceLineItems.quantity,
			unit: invoiceLineItems.unit,
			unit_price: invoiceLineItems.unit_price,
			taxable: invoiceLineItems.taxable,
			unit_cost: invoiceLineItems.unit_cost,
			source_catalog_item_id: invoiceLineItems.source_catalog_item_id,
			total: invoiceLineItems.total,
			is_late_fee: invoiceLineItems.is_late_fee,
			position: invoiceLineItems.position
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

	const paymentsRows = await db
		.select({
			id: payments.id,
			amount: payments.amount,
			tip_amount: payments.tip_amount,
			payment_method: payments.payment_method,
			stripe_payment_intent_id: payments.stripe_payment_intent_id,
			notes: payments.notes,
			recorded_by_name: orgMembers.full_name,
			paid_at: payments.paid_at,
			created_at: payments.created_at
		})
		.from(payments)
		.leftJoin(orgMembers, eq(orgMembers.id, payments.recorded_by))
		.where(and(eq(payments.invoice_id, id), eq(payments.org_id, auth.orgId)))
		.orderBy(desc(payments.paid_at));

	return json({
		data: {
			...row,
			invoice_number_display: formatInvoiceNumber(row.invoice_number),
			created_at: row.created_at.toISOString(),
			updated_at: row.updated_at.toISOString(),
			sent_at: row.sent_at?.toISOString() ?? null,
			paid_at: row.paid_at?.toISOString() ?? null,
			line_items: lineItems,
			payments: paymentsRows.map((p) => ({
				...p,
				paid_at: p.paid_at.toISOString(),
				created_at: p.created_at.toISOString()
			}))
		}
	});
};

export const PATCH: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canEditInvoice(auth.member)) error(403, 'Forbidden');

	const id = event.params.id!;

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const parsed = updateInvoiceSchema.safeParse(body);
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

	// Edit-after-send (Jobber / Housecall Pro pattern): an invoice is editable until it is fully
	// PAID; paid and cancelled invoices are locked financial records. Two safety rails guard a
	// non-draft edit — (1) the new total can never fall below money already collected, and (2) a
	// stale fixed-amount Stripe payment link (minted for the OLD balance) is retired so the
	// customer can't pay the wrong amount through it. The canonical /i/[token] page always shows
	// the live balance, and Re-send mints a fresh link.
	const result = await db.transaction(async (tx) => {
		const [existing] = await tx.execute<{
			id: string;
			status: string;
			total: string;
			amount_paid: string;
			stripe_payment_link_id: string | null;
		}>(sql`
			SELECT id, status, total, amount_paid, stripe_payment_link_id FROM invoices
			WHERE id = ${id} AND org_id = ${auth.orgId} AND deleted_at IS NULL
			FOR UPDATE
		`);
		if (!existing) throw error(404, 'Invoice not found');
		if (existing.status === 'paid' || existing.status === 'cancelled') {
			throw error(422, 'Paid or cancelled invoices can’t be edited');
		}

		const prevTotal = Number(existing.total);
		const amountPaid = Number(existing.amount_paid);

		const updates: Record<string, unknown> = { updated_at: new Date() };
		if (input.title !== undefined) updates.title = input.title;
		if (input.tax_rate !== undefined) updates.tax_rate = String(input.tax_rate);
		if (input.due_date !== undefined) updates.due_date = input.due_date;
		if (input.notes !== undefined) updates.notes = input.notes;
		if (input.terms !== undefined) updates.terms = input.terms;

		// Invoice-level discount. Setting type 'none' clears the value + label; the computed
		// discount_amount is nulled by recalcInvoiceTotals. Any discount change forces a recalc.
		let discountChanged = false;
		if (input.discount_type !== undefined) {
			updates.discount_type = input.discount_type;
			discountChanged = true;
			if (input.discount_type === 'none') {
				updates.discount_value = null;
				updates.discount_label = null;
			}
		}
		if (input.discount_type !== 'none') {
			if (input.discount_value !== undefined) {
				updates.discount_value =
					input.discount_value != null ? String(input.discount_value) : null;
				discountChanged = true;
			}
			if (input.discount_label !== undefined) updates.discount_label = input.discount_label;
		}

		await tx.update(invoices).set(updates).where(eq(invoices.id, id));

		if (input.line_items !== undefined) {
			await tx
				.update(invoiceLineItems)
				.set({ deleted_at: new Date(), updated_at: new Date() })
				.where(and(eq(invoiceLineItems.invoice_id, id), isNull(invoiceLineItems.deleted_at)));
			if (input.line_items.length > 0) {
				await tx.insert(invoiceLineItems).values(
					input.line_items.map((li, idx) => ({
						org_id: auth.orgId,
						invoice_id: id,
						description: li.description,
						quantity: String(li.quantity),
						unit: li.unit ?? null,
						unit_price: String(li.unit_price),
						taxable: li.taxable ?? true,
						unit_cost: li.unit_cost != null ? String(li.unit_cost) : null,
						source_catalog_item_id: li.source_catalog_item_id ?? null,
						total: computeLineTotal(li.quantity, li.unit_price),
						position: li.position ?? idx
					}))
				);
			}
			await recalcInvoiceTotals(tx, id);
		} else if (input.tax_rate !== undefined || discountChanged) {
			await recalcInvoiceTotals(tx, id);
		}

		// Re-read the recomputed total to enforce the safety rails (only totals can change it).
		const totalsTouched =
			input.line_items !== undefined || input.tax_rate !== undefined || discountChanged;
		let newTotal = prevTotal;
		if (totalsTouched) {
			const [after] = await tx.execute<{ total: string }>(
				sql`SELECT total FROM invoices WHERE id = ${id}`
			);
			newTotal = Number(after?.total ?? prevTotal);
		}

		// Rail 1 — never let the total drop below money already collected (partial payment). Throwing
		// rolls back the whole edit.
		if (amountPaid > 0 && newTotal < amountPaid) {
			throw error(
				422,
				`Total can’t be less than the ${formatCurrencyUsd(String(amountPaid))} already collected`
			);
		}

		// Rail 2 — a sent invoice whose total changed has a fixed-amount payment link for the OLD
		// balance. Null it now (kept in-tx so the app never surfaces a stale link); the Stripe-side
		// deactivation runs best-effort after commit (external call — Rule #9).
		let staleLinkId: string | null = null;
		if (existing.status !== 'draft' && existing.stripe_payment_link_id && newTotal !== prevTotal) {
			staleLinkId = existing.stripe_payment_link_id;
			await tx
				.update(invoices)
				.set({
					stripe_payment_link_url: null,
					stripe_payment_link_id: null,
					updated_at: new Date()
				})
				.where(eq(invoices.id, id));
		}

		return { staleLinkId };
	});

	// Deactivate the stale payment link on Stripe, OUTSIDE the transaction (Rule #9). Best-effort:
	// the stored columns are already cleared, so a failure only leaves an orphaned-but-unreferenced
	// link on Stripe — the customer can no longer reach it from our app.
	if (result.staleLinkId) {
		try {
			const [orgRow] = await db
				.select({ stripe_restricted_key: organizations.stripe_restricted_key })
				.from(organizations)
				.where(eq(organizations.id, auth.orgId))
				.limit(1);
			if (orgRow?.stripe_restricted_key) {
				await deactivatePaymentLink(
					getOrgStripeClient(orgRow.stripe_restricted_key),
					result.staleLinkId
				);
			}
		} catch (err) {
			console.error('[invoice-edit] Failed to deactivate stale payment link:', err);
		}
	}

	return json({ data: { id } });
};
