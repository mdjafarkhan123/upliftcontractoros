import { json, error } from '@sveltejs/kit';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { invoices } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canCancelInvoice } from '$lib/server/invoices/permissions';

// Close an invoice (Jobber InvoiceCloseOptionsType). Two modes, both reversible via /reopen:
//   - mark_received: the money came in OUTSIDE the app (cash/check/etc.) — close it, log NO payment.
//     Status flips to 'paid' with received_at stamped so reports tell a courtesy close from a real
//     collected payment. paid_at is set so the invoice reads as settled.
//   - bad_debt: the balance is uncollectible — write it off. Status flips to 'bad_debt', bad_debt_at
//     stamped, written_off_amount snapshots the remaining balance. Stays on record, off the AR lists.
const closeSchema = z.object({ mode: z.enum(['mark_received', 'bad_debt']) });

export const POST: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canCancelInvoice(auth.member)) error(403, 'Forbidden');

	const id = event.params.id!;

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}
	const parsed = closeSchema.safeParse(body);
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 422 });
	}
	const { mode } = parsed.data;

	const now = new Date();

	const result = await db.transaction(async (tx) => {
		const [existing] = await tx.execute<{
			id: string;
			status: string;
			amount_due: string;
		}>(sql`
			SELECT id, status, amount_due FROM invoices
			WHERE id = ${id} AND org_id = ${auth.orgId} AND deleted_at IS NULL
			FOR UPDATE
		`);
		if (!existing) throw error(404, 'Invoice not found');
		if (existing.status === 'draft') {
			throw error(422, 'Send the invoice before closing it');
		}
		if (existing.status === 'paid') {
			throw error(422, 'This invoice is already paid');
		}
		if (existing.status === 'bad_debt') {
			throw error(422, 'This invoice is already written off as bad debt');
		}
		if (Number(existing.amount_due) <= 0) {
			throw error(422, 'This invoice has no balance to close');
		}

		if (mode === 'mark_received') {
			await tx
				.update(invoices)
				.set({
					status: 'paid',
					received_at: now,
					// Stamp paid_at only if not already set (a partial payment may have set it — leave it).
					paid_at: sql`COALESCE(${invoices.paid_at}, ${now})`,
					updated_at: now
				})
				.where(eq(invoices.id, id));
			return { id, status: 'paid' as const };
		}

		// bad_debt — write off the remaining balance.
		await tx
			.update(invoices)
			.set({
				status: 'bad_debt',
				bad_debt_at: now,
				written_off_amount: existing.amount_due,
				updated_at: now
			})
			.where(eq(invoices.id, id));
		return { id, status: 'bad_debt' as const };
	});

	return json({ data: result });
};
