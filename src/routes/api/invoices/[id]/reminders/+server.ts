import { json, error } from '@sveltejs/kit';
import { z } from 'zod';
import { sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { outboxEvents } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canEditInvoice } from '$lib/server/invoices/permissions';
import { invoiceRemindersToggledEvent } from '$lib/server/invoices/events';

const bodySchema = z.object({ enabled: z.boolean() });

// Per-invoice automatic-reminders switch. Unlike the main PATCH (draft-only), this
// works at any status so the contractor can turn reminders on/off for a specific
// invoice before OR after sending. For a DRAFT the flag is just persisted — the
// dunning enrollment happens later at invoice.sent and reads the flag fresh. For a
// SENT/overdue/partially_paid invoice we emit invoice.reminders_toggled so the
// worker re-enrolls (on) or stops the pending reminders (off) — reminders are only
// ever started/stopped from the worker, never directly from a route.
export const POST: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canEditInvoice(auth.member)) error(403, 'Forbidden');

	const id = event.params.id!;

	let raw: unknown;
	try {
		raw = await event.request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}
	const parsed = bodySchema.safeParse(raw);
	if (!parsed.success) {
		return json({ error: 'Invalid input' }, { status: 422 });
	}
	const enabled = parsed.data.enabled;

	await db.transaction(async (tx) => {
		const [existing] = await tx.execute<{
			id: string;
			status: string;
			contact_id: string;
			due_date: string | null;
		}>(sql`
			SELECT id, status, contact_id, due_date FROM invoices
			WHERE id = ${id} AND org_id = ${auth.orgId} AND deleted_at IS NULL
			FOR UPDATE
		`);
		if (!existing) throw error(404, 'Invoice not found');

		await tx.execute(sql`
			UPDATE invoices
			SET send_payment_reminders = ${enabled}, updated_at = now()
			WHERE id = ${id} AND org_id = ${auth.orgId}
		`);

		// A live (sent) invoice already has — or should have — a dunning enrollment;
		// signal the worker to re-enroll or stop it. Drafts have no enrollment yet, so
		// there's nothing to change until they're sent (the flag is read at send time).
		const live =
			existing.status === 'sent' ||
			existing.status === 'partially_paid' ||
			existing.status === 'overdue';
		if (live) {
			await tx.insert(outboxEvents).values(
				invoiceRemindersToggledEvent({
					orgId: auth.orgId,
					invoiceId: id,
					contactId: existing.contact_id,
					enabled,
					dueDate: existing.due_date
				})
			);
		}
	});

	return json({ data: { id, send_payment_reminders: enabled } });
};
