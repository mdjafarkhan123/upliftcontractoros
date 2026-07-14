import { json, error } from '@sveltejs/kit';
import { z } from 'zod';
import { sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canEditInvoice } from '$lib/server/invoices/permissions';

const bodySchema = z.object({ enabled: z.boolean() });

// Per-invoice accept-tips switch. Works at any status — the contractor can turn tips
// on/off for a specific invoice before OR after sending. Simpler than /reminders:
// tips enroll nothing, so there is NO outbox event and NO status branching. The
// effective gate (org.tips_enabled AND accept_tips) is computed at read time in
// lookupValidInvoiceByToken / record-payment — this route only persists the flag.
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

	const result = await db.execute(sql`
		UPDATE invoices
		SET accept_tips = ${enabled}, updated_at = now()
		WHERE id = ${id} AND org_id = ${auth.orgId} AND deleted_at IS NULL
		RETURNING id
	`);
	if (result.length === 0) error(404, 'Invoice not found');

	return json({ data: { id, accept_tips: enabled } });
};
