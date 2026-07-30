import { json, error } from '@sveltejs/kit';
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import {
	appointments,
	contacts,
	invoiceLineItems,
	invoices,
	jobInvoiceReminders,
	orgMembers,
	organizations,
	payments
} from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import {
	canDeleteInvoice,
	canEditInvoice,
	canViewAnyInvoice
} from '$lib/server/invoices/permissions';
import { updateInvoiceSchema } from '$lib/server/invoices/schemas';
import { formatCurrencyUsd, formatInvoiceNumber } from '$lib/server/invoices/format';
import { computeLineTotal, recalcInvoiceTotals } from '$lib/server/invoices/recalc';
import { deactivatePaymentLink, getOrgStripeClient } from '$lib/server/invoices/stripe';
import { repinOneOffJobSchedule } from '$lib/server/jobs/repinSchedule';

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
			received_at: invoices.received_at,
			bad_debt_at: invoices.bad_debt_at,
			written_off_amount: invoices.written_off_amount,
			signature_name: invoices.signature_name,
			signature_media_id: invoices.signature_media_id,
			signed_at: invoices.signed_at,
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

	// row gates (404); line items and payments are independent of each other — one wave.
	const [lineItems, paymentsRows] = await Promise.all([
		db
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
			.orderBy(asc(invoiceLineItems.position), asc(invoiceLineItems.created_at)),

		db
			.select({
				id: payments.id,
				amount: payments.amount,
				tip_amount: payments.tip_amount,
				adjustment_type: payments.adjustment_type,
				applies_to_payment_id: payments.applies_to_payment_id,
				payment_method: payments.payment_method,
				stripe_payment_intent_id: payments.stripe_payment_intent_id,
				notes: payments.notes,
				recorded_by_name: orgMembers.full_name,
				paid_at: payments.paid_at,
				receipt_sent_at: payments.receipt_sent_at,
				receipt_sent_via: payments.receipt_sent_via,
				created_at: payments.created_at
			})
			.from(payments)
			.leftJoin(orgMembers, eq(orgMembers.id, payments.recorded_by))
			.where(and(eq(payments.invoice_id, id), eq(payments.org_id, auth.orgId)))
			.orderBy(desc(payments.paid_at))
	]);

	return json({
		data: {
			...row,
			invoice_number_display: formatInvoiceNumber(row.invoice_number),
			created_at: row.created_at.toISOString(),
			updated_at: row.updated_at.toISOString(),
			sent_at: row.sent_at?.toISOString() ?? null,
			paid_at: row.paid_at?.toISOString() ?? null,
			received_at: row.received_at?.toISOString() ?? null,
			bad_debt_at: row.bad_debt_at?.toISOString() ?? null,
			signed_at: row.signed_at?.toISOString() ?? null,
			line_items: lineItems,
			payments: paymentsRows.map((p) => ({
				...p,
				paid_at: p.paid_at.toISOString(),
				receipt_sent_at: p.receipt_sent_at?.toISOString() ?? null,
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
		if (existing.status === 'paid' || existing.status === 'bad_debt') {
			throw error(422, 'Paid or written-off invoices can’t be edited');
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
				updates.discount_value = input.discount_value != null ? String(input.discount_value) : null;
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

export const DELETE: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canDeleteInvoice(auth.member)) error(403, 'Forbidden');

	const id = event.params.id!;
	const now = new Date();

	// Deleting an invoice must REVERSE everything invoice-creation did to a visit-based job's visits,
	// so the visit "flips back to its default state" — otherwise a deleted invoice would leave its
	// visits looking permanently billed (never reappearing in the picker). All of it runs in one
	// transaction so the invoice can't be gone while its visits stay stamped.
	await db.transaction(async (tx) => {
		// A paid or partly-paid invoice is a financial record — Jobber blocks deleting an invoice
		// with money against it (you must refund/remove the payments first). Drafts and sent-but-unpaid
		// invoices (and cancelled ones, which by rule have no payments) delete freely. The guard +
		// soft-delete run in one atomic statement so the payment check can't race the delete.
		const rows = await tx
			.update(invoices)
			.set({ deleted_at: now, updated_at: now })
			.where(
				and(
					eq(invoices.id, id),
					eq(invoices.org_id, auth.orgId),
					isNull(invoices.deleted_at),
					sql`${invoices.status} <> 'paid'`,
					sql`${invoices.amount_paid} = 0`
				)
			)
			.returning({ id: invoices.id, job_id: invoices.job_id });

		if (rows.length === 0) {
			// Distinguish "blocked because it has payments" from "genuinely not found".
			const [existing] = await tx
				.select({ status: invoices.status, amount_paid: invoices.amount_paid })
				.from(invoices)
				.where(
					and(eq(invoices.id, id), eq(invoices.org_id, auth.orgId), isNull(invoices.deleted_at))
				)
				.limit(1);
			if (existing && (existing.status === 'paid' || Number(existing.amount_paid) > 0)) {
				throw error(
					422,
					'Invoices with recorded payments can’t be deleted — refund the payment first'
				);
			}
			throw error(404, 'Invoice not found');
		}

		const jobId = rows[0].job_id;

		// 1) Un-bill every visit this invoice billed. Clearing billed_invoice_id is what makes the
		//    visit selectable again in the "Select visits to invoice" picker and re-adds it to the
		//    job's "Requires Invoicing" set (the reported bug: it never came back before).
		const unbilled = await tx
			.update(appointments)
			.set({ billed_invoice_id: null, updated_at: now })
			.where(and(eq(appointments.org_id, auth.orgId), eq(appointments.billed_invoice_id, id)))
			.returning({ id: appointments.id });

		// 2) Revert ONLY the completions THIS invoice caused (Part 1 auto-complete). The marker
		//    completed_via_invoice_id is the deterministic key — a crew-entered completion has it NULL
		//    and is deliberately left untouched, so real work is never un-completed.
		const reopened = await tx
			.update(appointments)
			.set({
				status: 'scheduled',
				completed_at: null,
				completed_by: null,
				completed_via_invoice_id: null,
				updated_at: now
			})
			.where(
				and(eq(appointments.org_id, auth.orgId), eq(appointments.completed_via_invoice_id, id))
			)
			.returning({ id: appointments.id });

		// 3) Reopen the auto invoice-reminders the invoice had discharged for those visits, so the
		//    "invoice this visit" prompt returns. Only source='auto' + completed rows for the exact
		//    un-billed visits — manual reminders and unrelated ones are left alone.
		if (unbilled.length > 0) {
			await tx
				.update(jobInvoiceReminders)
				.set({ status: 'active', completed_at: null, completed_by: null, updated_at: now })
				.where(
					and(
						eq(jobInvoiceReminders.org_id, auth.orgId),
						inArray(
							jobInvoiceReminders.visit_id,
							unbilled.map((v) => v.id)
						),
						eq(jobInvoiceReminders.source, 'auto'),
						eq(jobInvoiceReminders.status, 'completed'),
						isNull(jobInvoiceReminders.deleted_at)
					)
				);
		}

		// 4) If a completion reverted, the earliest open visit changed — re-pin the job's denormalized
		//    schedule date so its list badge (Today/Upcoming/Overdue) follows the visit rows. No-op for
		//    series-anchor / recurring / as-needed jobs (guarded inside the helper).
		if (jobId && reopened.length > 0) {
			await repinOneOffJobSchedule(tx, { orgId: auth.orgId, jobId });
		}
	});

	return new Response(null, { status: 204 });
};
