import { json, error } from '@sveltejs/kit';
import { eq, sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { invoices } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canCancelInvoice } from '$lib/server/invoices/permissions';

export const POST: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canCancelInvoice(auth.member)) error(403, 'Forbidden');

	const id = event.params.id!;

	await db.transaction(async (tx) => {
		const [existing] = await tx.execute<{ id: string; status: string; amount_paid: string }>(sql`
			SELECT id, status, amount_paid FROM invoices
			WHERE id = ${id} AND org_id = ${auth.orgId} AND deleted_at IS NULL
			FOR UPDATE
		`);
		if (!existing) throw error(404, 'Invoice not found');
		if (existing.status === 'cancelled') throw error(422, 'Invoice is already cancelled');
		if (existing.status === 'paid') throw error(422, 'Paid invoices cannot be cancelled');
		if (Number(existing.amount_paid) > 0) {
			throw error(422, 'Cannot cancel an invoice with recorded payments — refund first');
		}

		await tx
			.update(invoices)
			.set({ status: 'cancelled', updated_at: new Date() })
			.where(eq(invoices.id, id));
	});

	return json({ data: { id, status: 'cancelled' } });
};
