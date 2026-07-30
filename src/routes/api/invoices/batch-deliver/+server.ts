import { json, error, isHttpError } from '@sveltejs/kit';
import { and, inArray, isNull, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { invoices } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canSendInvoice } from '$lib/server/invoices/permissions';
import { formatInvoiceNumber } from '$lib/server/invoices/format';
import { sendInvoice } from '$lib/server/invoices/send';

// Batch Deliver invoices (Jobber's two-part batch billing, part 2). After Batch Create leaves a pile
// of DRAFT invoices, the contractor multi-selects them on the Invoices list, picks the channel(s) once
// (email / text / both), and we send each to its OWN client with the standard invoice copy — merge
// tokens fill per-client in the worker. Drafts only, matching Jobber's "deliver the freshly-created
// ones" framing; re-sending a sent invoice stays a per-row action.
//
// Each invoice sends independently (its own transaction inside sendInvoice) so one client with no email
// never blocks the rest — we report per-invoice sent / skipped / failed, like Jobber.
const batchDeliverSchema = z.object({
	ids: z.array(z.string().uuid()).min(1).max(100),
	channels: z.array(z.enum(['email', 'sms'])).min(1),
	// Optional shared message overrides — applied to EVERY invoice (merge tokens fill per-client in
	// the worker). Null / omitted keeps the worker's built-in copy. Same limits as sendInvoiceSchema.
	sms_body: z.string().trim().max(640).nullable().optional(),
	email_subject: z.string().trim().max(200).nullable().optional(),
	email_body: z.string().trim().max(5000).nullable().optional()
});

export const POST: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canSendInvoice(auth.member)) error(403, 'Forbidden');

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		error(400, 'Invalid JSON body');
	}

	const parsed = batchDeliverSchema.safeParse(body);
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 422 });
	}
	// De-dupe while preserving order.
	const ids = [...new Set(parsed.data.ids)];
	const channels = parsed.data.channels;
	const smsBody = parsed.data.sms_body ?? null;
	const emailSubject = parsed.data.email_subject ?? null;
	const emailBody = parsed.data.email_body ?? null;

	// Drafts only. Any selected invoice that isn't a draft anymore (already sent, paid, cancelled, or
	// deleted out from under the selection) is skipped up front rather than re-sent.
	const rows = await db
		.select({ id: invoices.id, status: invoices.status, invoice_number: invoices.invoice_number })
		.from(invoices)
		.where(
			and(eq(invoices.org_id, auth.orgId), inArray(invoices.id, ids), isNull(invoices.deleted_at))
		);
	const rowById = new Map(rows.map((r) => [r.id, r]));

	const sent: { invoice_id: string; invoice_number_display: string }[] = [];
	const skipped: { invoice_id: string; invoice_number_display: string; reason: string }[] = [];
	const failed: { invoice_id: string; invoice_number_display: string; reason: string }[] = [];

	const display = (id: string) => {
		const r = rowById.get(id);
		return r ? formatInvoiceNumber(r.invoice_number) : id;
	};

	// Sequential on purpose: each send creates its own Stripe Payment Link + write transaction, and
	// running dozens concurrently would hammer the connection pool and the payment provider. A batch
	// is a manager action on a handful of invoices.
	for (const id of ids) {
		const row = rowById.get(id);
		if (!row) {
			skipped.push({
				invoice_id: id,
				invoice_number_display: id,
				reason: 'No longer available.'
			});
			continue;
		}
		if (row.status !== 'draft') {
			skipped.push({
				invoice_id: id,
				invoice_number_display: display(id),
				reason: 'Already sent — re-send it individually if needed.'
			});
			continue;
		}
		try {
			await sendInvoice(auth.orgId, id, {
				channels,
				sms_body: smsBody,
				email_subject: emailSubject,
				email_body: emailBody
			});
			sent.push({ invoice_id: id, invoice_number_display: display(id) });
		} catch (err) {
			// A reachability problem (no email / opted out of texts) is an expected 422 — that's a skip,
			// not a failure. Any other HttpError or unexpected throw is a genuine failure; keep going.
			const message = isHttpError(err)
				? ((err.body as { message?: string })?.message ?? 'Could not send invoice.')
				: 'Something went wrong sending this invoice.';
			if (isHttpError(err) && err.status === 422) {
				skipped.push({ invoice_id: id, invoice_number_display: display(id), reason: message });
			} else {
				failed.push({ invoice_id: id, invoice_number_display: display(id), reason: message });
			}
		}
	}

	return json({ data: { sent, skipped, failed } });
};
