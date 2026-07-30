import { json, error } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canCreateInvoice } from '$lib/server/invoices/permissions';
import { formatInvoiceNumber } from '$lib/server/invoices/format';
import { createJobInvoice } from '$lib/server/jobs/createJobInvoice';

// Generate an invoice for a job on demand ("Generate invoice" / "Create" on the Billing card). Manual
// v1 — the contractor presses this; nothing auto-charges (that layer is deferred). All the billing
// logic lives in the shared createJobInvoice helper (also used by Batch Create) — see it for the
// fixed_price vs visit_based branching. An optional `visit_ids` body (from the "Select visits to
// invoice" picker — Jobber ref/billing/21) bills EXACTLY those visits; omitting it bills every PAST
// unbilled visit.
const generateInvoiceSchema = z.object({
	visit_ids: z.array(z.string().uuid()).min(1).optional()
});

export const POST: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canCreateInvoice(auth.member)) error(403, 'Forbidden');

	const jobId = event.params.id!;

	// Optional body: an empty body keeps the "all past unbilled visits" default.
	let visitIds: string[] | null = null;
	const rawBody = await event.request.text();
	if (rawBody.trim()) {
		let parsedJson: unknown;
		try {
			parsedJson = JSON.parse(rawBody);
		} catch {
			return json({ error: 'Invalid JSON body' }, { status: 400 });
		}
		const parsed = generateInvoiceSchema.safeParse(parsedJson);
		if (!parsed.success) {
			return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 422 });
		}
		visitIds = parsed.data.visit_ids ?? null;
	}

	const result = await db.transaction((tx) =>
		createJobInvoice(tx, { orgId: auth.orgId, jobId, memberId: auth.member.id, visitIds })
	);

	return json(
		{
			data: {
				id: result.id,
				invoice_number_display: formatInvoiceNumber(result.invoice_number),
				visit_count: result.visit_count
			}
		},
		{ status: 201 }
	);
};
