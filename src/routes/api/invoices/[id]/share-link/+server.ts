import { json, error } from '@sveltejs/kit';
import { eq, sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { db } from '$lib/server/db/client';
import { invoices } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canSendInvoice } from '$lib/server/invoices/permissions';
import { generateToken } from '$lib/server/quotes/token';

/**
 * Returns the customer-facing public link for an invoice so the contractor can copy /
 * paste it anywhere (WhatsApp, iMessage, in person). This is the "Copy link" escape hatch
 * used when the customer has no email and has opted out of texts, so no email/SMS can be
 * delivered automatically.
 *
 * Sharing a *draft* mints the token and moves the invoice out of Draft (Jobber /
 * Housecall behaviour) so the pasted link actually opens — but it deliberately does NOT
 * emit an invoice.sent outbox event, so no automated delivery or dunning reminders fire
 * (the contractor is delivering it by hand). A later Send / Re-send handles delivery +
 * automation as usual.
 */
export const POST: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canSendInvoice(auth.member)) error(403, 'Forbidden');

	const id = event.params.id!;

	const token = await db.transaction(async (tx) => {
		const [existing] = await tx.execute<{
			id: string;
			status: string;
			public_token: string | null;
			due_date: string | null;
		}>(sql`
			SELECT id, status, public_token, due_date FROM invoices
			WHERE id = ${id} AND org_id = ${auth.orgId} AND deleted_at IS NULL
			FOR UPDATE
		`);
		if (!existing) throw error(404, 'Invoice not found');

		if (existing.status === 'bad_debt') {
			throw error(422, 'This invoice was written off — reopen it before sharing');
		}

		// Already live and already carries a token → hand back the same link.
		if (existing.status !== 'draft' && existing.public_token) {
			return existing.public_token;
		}

		// Need to mint a token. Same guard as /send: never make an empty invoice viewable.
		const [lineCount] = await tx.execute<{ c: number }>(sql`
			SELECT COUNT(*)::int AS c FROM invoice_line_items
			WHERE invoice_id = ${id} AND deleted_at IS NULL
		`);
		if (!lineCount || lineCount.c === 0) {
			throw error(422, 'Add at least one line item before sharing');
		}

		const rawToken = existing.public_token ?? generateToken();
		const now = new Date();
		const updates: Record<string, unknown> = { updated_at: now };
		if (!existing.public_token) updates.public_token = rawToken;
		// First time it becomes viewable: leave Draft and stamp the delivered date, exactly like
		// /send — but without the outbox event (manual delivery, no automation). Strict Jobber:
		// sent_not_due when a due date is still in the future, else awaiting_payment.
		if (existing.status === 'draft') {
			let firstStatus: 'sent_not_due' | 'awaiting_payment' = 'awaiting_payment';
			if (existing.due_date) {
				const due = new Date(existing.due_date);
				if (!Number.isNaN(due.getTime())) {
					const today = new Date();
					today.setHours(0, 0, 0, 0);
					due.setHours(0, 0, 0, 0);
					if (due.getTime() > today.getTime()) firstStatus = 'sent_not_due';
				}
			}
			updates.status = firstStatus;
			updates.sent_at = now;
		}
		await tx.update(invoices).set(updates).where(eq(invoices.id, id));

		return rawToken;
	});

	const base = (env.APP_URL ?? event.url.origin).replace(/\/$/, '');
	return json({ data: { url: `${base}/i/${token}` } });
};
