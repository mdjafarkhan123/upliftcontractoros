import { json, error } from '@sveltejs/kit';
import { sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { invoiceLineItems } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canEditInvoice } from '$lib/server/invoices/permissions';
import { recalcInvoiceTotals } from '$lib/server/invoices/recalc';

// M8 late fees — MANUAL "Add late fee" on an overdue invoice. Computes the fee from the INVOICE's
// own snapshot terms (M8 Phase 2: late_fee_type + late_fee_value, seeded from the org default at
// create, editable per invoice) and inserts it as a real, non-taxable is_late_fee line item, then
// recalcs. Because it's a real line the balance/PDF/public/Stripe flows all pick it up with no
// extra plumbing. One fee per invoice — remove (DELETE) to redo. The effective gate is
// org.late_fee_enabled AND invoice.late_fee_enabled; the auto-after-grace sweep uses the same math.

type OrgFeeConfig = {
	late_fee_enabled: boolean;
};

type InvoiceRow = {
	id: string;
	status: string;
	amount_due: string;
	due_date: string | null;
	late_fee_enabled: boolean;
	late_fee_type: string | null;
	late_fee_value: string | null;
	existing_fee: string | null;
	max_position: number | null;
};

function round2(n: number): number {
	return Math.round(n * 100) / 100;
}

export const POST: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canEditInvoice(auth.member)) error(403, 'Forbidden');

	const id = event.params.id!;

	const fee = await db.transaction(async (tx) => {
		const [org] = await tx.execute<OrgFeeConfig>(sql`
			SELECT late_fee_enabled
			FROM organizations
			WHERE id = ${auth.orgId}
		`);
		if (!org?.late_fee_enabled) {
			throw error(422, 'Late fees are turned off for your account.');
		}

		const [inv] = await tx.execute<InvoiceRow>(sql`
			SELECT
				i.id,
				i.status,
				i.amount_due,
				i.due_date,
				i.late_fee_enabled,
				i.late_fee_type,
				i.late_fee_value,
				(SELECT total FROM invoice_line_items li
					WHERE li.invoice_id = i.id AND li.is_late_fee = true AND li.deleted_at IS NULL
					LIMIT 1) AS existing_fee,
				(SELECT MAX(position) FROM invoice_line_items li
					WHERE li.invoice_id = i.id AND li.deleted_at IS NULL) AS max_position
			FROM invoices i
			WHERE i.id = ${id} AND i.org_id = ${auth.orgId} AND i.deleted_at IS NULL
			FOR UPDATE OF i
		`);
		if (!inv) throw error(404, 'Invoice not found');

		// Effective gate: the org master switch (checked above) AND this invoice opting in.
		if (!inv.late_fee_enabled) {
			throw error(422, 'Late fees are turned off for this invoice.');
		}

		// Only an overdue balance can be charged a late fee. 'overdue' is the cron-flipped state;
		// a sent/partially-paid invoice already past its due date is treated the same.
		const pastDue =
			inv.status === 'overdue' ||
			((inv.status === 'sent' || inv.status === 'partially_paid') &&
				inv.due_date != null &&
				inv.due_date < new Date().toISOString().slice(0, 10));
		if (!pastDue) {
			throw error(422, 'A late fee can only be applied to an overdue invoice.');
		}

		if (inv.existing_fee != null) {
			throw error(422, 'A late fee has already been applied. Remove it first to change it.');
		}

		// Compute the fee from the INVOICE's own snapshot terms. Percent is of the current unpaid
		// balance; flat is the fixed dollar amount. A single late_fee_value column holds whichever.
		let feeAmount: number;
		if (inv.late_fee_type === 'flat') {
			feeAmount = round2(Number(inv.late_fee_value ?? 0));
		} else {
			const pct = Number(inv.late_fee_value ?? 0);
			feeAmount = round2(Number(inv.amount_due) * (pct / 100));
		}
		if (!Number.isFinite(feeAmount) || feeAmount <= 0) {
			throw error(422, 'Set a late fee amount on this invoice first.');
		}

		const feeStr = feeAmount.toFixed(2);
		await tx.insert(invoiceLineItems).values({
			org_id: auth.orgId,
			invoice_id: id,
			description: 'Late fee',
			quantity: '1',
			unit_price: feeStr,
			taxable: false,
			is_late_fee: true,
			total: feeStr,
			position: (inv.max_position ?? 0) + 1
		});

		await recalcInvoiceTotals(tx, id);
		return feeStr;
	});

	return json({ data: { id, late_fee: fee } });
};

// Remove the applied late fee (soft-deletes the is_late_fee line, then recalcs the balance).
export const DELETE: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canEditInvoice(auth.member)) error(403, 'Forbidden');

	const id = event.params.id!;

	await db.transaction(async (tx) => {
		const [inv] = await tx.execute<{ id: string }>(sql`
			SELECT id FROM invoices
			WHERE id = ${id} AND org_id = ${auth.orgId} AND deleted_at IS NULL
			FOR UPDATE
		`);
		if (!inv) throw error(404, 'Invoice not found');

		const removed = await tx.execute(sql`
			UPDATE invoice_line_items
			SET deleted_at = now(), updated_at = now()
			WHERE invoice_id = ${id} AND org_id = ${auth.orgId}
				AND is_late_fee = true AND deleted_at IS NULL
			RETURNING id
		`);
		if (removed.length === 0) throw error(422, 'No late fee to remove.');

		await recalcInvoiceTotals(tx, id);
	});

	return json({ data: { id } });
};
