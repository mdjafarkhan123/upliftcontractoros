import { json, error } from '@sveltejs/kit';
import { sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canSendInvoice } from '$lib/server/invoices/permissions';
import { invoices } from '$lib/server/db/schema';

/**
 * Mark an invoice as sent without delivering email or SMS.
 * This is the Jobber-style offline/manual delivery action: it makes the invoice
 * collectible and records the sent timestamp, but does not enqueue notification work.
 */
export const POST: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canSendInvoice(auth.member)) error(403, 'Forbidden');

	const id = event.params.id!;
	const result = await db.transaction(async (tx) => {
		const [row] = await tx.execute<{
			id: string;
			status: string;
			due_date: string | null;
			amount_due: string;
		}>(sql`
			SELECT id, status, due_date, amount_due
			FROM invoices
			WHERE id = ${id} AND org_id = ${auth.orgId} AND deleted_at IS NULL
			FOR UPDATE
		`);
		if (!row) throw error(404, 'Invoice not found');
		if (row.status !== 'draft') throw error(422, 'Only draft invoices can be marked as sent');

		const [lineCount] = await tx.execute<{ count: number }>(sql`
			SELECT COUNT(*)::int AS count
			FROM invoice_line_items
			WHERE invoice_id = ${id} AND org_id = ${auth.orgId} AND deleted_at IS NULL
		`);
		if (!lineCount || lineCount.count === 0) {
			throw error(422, 'Add at least one line item before marking the invoice as sent');
		}

		const today = new Date();
		today.setHours(0, 0, 0, 0);
		const due = row.due_date ? new Date(row.due_date) : null;
		if (due) due.setHours(0, 0, 0, 0);
		const nextStatus =
			Number(row.amount_due) <= 0.001
				? 'paid'
				: due && !Number.isNaN(due.getTime()) && due > today
					? 'sent_not_due'
					: 'awaiting_payment';
		const now = new Date();
		await tx
			.update(invoices)
			.set({
				status: nextStatus,
				sent_at: now,
				paid_at: nextStatus === 'paid' ? now : null,
				updated_at: now
			})
			.where(sql`${invoices.id} = ${id}`);

		return { id, status: nextStatus, sent_at: now.toISOString() };
	});

	return json({ data: result });
};
