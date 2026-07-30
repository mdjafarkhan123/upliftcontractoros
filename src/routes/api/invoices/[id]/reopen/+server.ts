import { json, error } from '@sveltejs/kit';
import { eq, sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { invoices } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canCancelInvoice } from '$lib/server/invoices/permissions';
import { recalcInvoiceTotals } from '$lib/server/invoices/recalc';

// Reverse a close (Jobber invoiceReopen / invoiceUnmarkBadDebt). Undoes either a Mark-Received
// (received_at set, status 'paid') or a Bad-Debt write-off (status 'bad_debt'), clears the markers,
// then recomputes the live status from the amounts + due date via the shared recalc state machine.
export const POST: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canCancelInvoice(auth.member)) error(403, 'Forbidden');

	const id = event.params.id!;
	const now = new Date();

	const result = await db.transaction(async (tx) => {
		const [existing] = await tx.execute<{
			id: string;
			status: string;
			received_at: string | null;
		}>(sql`
			SELECT id, status, received_at FROM invoices
			WHERE id = ${id} AND org_id = ${auth.orgId} AND deleted_at IS NULL
			FOR UPDATE
		`);
		if (!existing) throw error(404, 'Invoice not found');

		const isClosed = existing.status === 'bad_debt' || existing.received_at != null;
		if (!isClosed) {
			throw error(422, 'This invoice isn’t closed');
		}

		// Clear the close markers and set a neutral status so recalc (which freezes draft/bad_debt) can
		// re-derive the collectible state. paid_at is cleared here; recalc re-sets it only if the
		// remaining payments actually cover the total.
		await tx
			.update(invoices)
			.set({
				status: 'awaiting_payment',
				received_at: null,
				bad_debt_at: null,
				written_off_amount: null,
				paid_at: null,
				updated_at: now
			})
			.where(eq(invoices.id, id));

		await recalcInvoiceTotals(tx, id);

		const [after] = await tx.execute<{ status: string }>(sql`
			SELECT status FROM invoices WHERE id = ${id}
		`);
		return { id, status: after?.status ?? 'awaiting_payment' };
	});

	return json({ data: result });
};
