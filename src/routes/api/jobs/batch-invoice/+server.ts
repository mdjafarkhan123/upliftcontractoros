import { json, error, isHttpError } from '@sveltejs/kit';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { jobPaymentMilestones } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canCreateInvoice } from '$lib/server/invoices/permissions';
import { createJobInvoice } from '$lib/server/jobs/createJobInvoice';
import { formatInvoiceNumber } from '$lib/server/invoices/format';

// Batch Create invoices (Jobber's two-part batch billing, part 1). The contractor multi-selects jobs
// in the "Requires Invoicing" list and presses "Create invoices" — we generate one DRAFT invoice per
// job, using the SAME per-job logic as the single-job "Create" button (createJobInvoice), with no
// per-job visit picker (batch bills what's due). Delivering them to clients in bulk is Batch Deliver
// (a separate step). Progress-invoicing jobs (an open payment schedule) are skipped — those bill one
// milestone at a time and can't be batched.
//
// Each job runs in its OWN transaction so one job's failure (no billable visits, unconfigured
// billing) never rolls back the others — we report per-job created / skipped / failed, like Jobber.
const batchInvoiceSchema = z.object({
	ids: z.array(z.string().uuid()).min(1).max(100)
});

export const POST: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canCreateInvoice(auth.member)) error(403, 'Forbidden');

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		error(400, 'Invalid JSON body');
	}

	const parsed = batchInvoiceSchema.safeParse(body);
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 422 });
	}
	// De-dupe while preserving order.
	const ids = [...new Set(parsed.data.ids)];

	// Jobs with an open (uninvoiced) payment schedule bill one milestone at a time — skip them from
	// the batch rather than snapshot all their line items into a wrong invoice.
	const milestoneRows = await db
		.select({ job_id: jobPaymentMilestones.job_id })
		.from(jobPaymentMilestones)
		.where(
			and(
				eq(jobPaymentMilestones.org_id, auth.orgId),
				inArray(jobPaymentMilestones.job_id, ids),
				isNull(jobPaymentMilestones.invoice_id),
				isNull(jobPaymentMilestones.deleted_at)
			)
		);
	const milestoneJobIds = new Set(milestoneRows.map((r) => r.job_id));

	const created: { job_id: string; invoice_id: string; invoice_number_display: string }[] = [];
	const skipped: { job_id: string; reason: string }[] = [];
	const failed: { job_id: string; reason: string }[] = [];

	// Sequential on purpose: each is an independent write transaction, and running dozens of big
	// invoice-creating transactions concurrently would hammer the connection pool and invite
	// row-lock contention on org_counters. A batch is a manager action on a handful of jobs.
	for (const jobId of ids) {
		if (milestoneJobIds.has(jobId)) {
			skipped.push({
				job_id: jobId,
				reason: 'Has a payment schedule — invoice each part from the job’s Billing tab.'
			});
			continue;
		}
		try {
			const result = await db.transaction((tx) =>
				createJobInvoice(tx, { orgId: auth.orgId, jobId, memberId: auth.member.id })
			);
			created.push({
				job_id: jobId,
				invoice_id: result.id,
				invoice_number_display: formatInvoiceNumber(result.invoice_number)
			});
		} catch (err) {
			// createJobInvoice throws SvelteKit error(422/404, msg) for expected invalid states; surface
			// that message. Anything else is unexpected — report a generic reason, keep the batch going.
			const reason = isHttpError(err)
				? ((err.body as { message?: string })?.message ?? 'Could not create invoice.')
				: 'Something went wrong creating this invoice.';
			failed.push({ job_id: jobId, reason });
		}
	}

	return json({ data: { created, skipped, failed } });
};
