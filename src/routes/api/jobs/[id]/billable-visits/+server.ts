import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canViewJob } from '$lib/server/jobs/permissions';
import { loadBillableVisits } from '$lib/server/jobs/billableVisits';

// GET /api/jobs/[id]/billable-visits — the visit set for the "Select visits to invoice" picker
// (Jobber ref/billing/21) and the recurring Invoicing-tab "Create" row (ref/billing/20). Returns
// the job header row + the billable visits (uninvoiced on-or-before today + the single next
// upcoming). Empty visits for a non-visit-based job. Read-only; the money mutation lives in
// generate-invoice, which is separately gated on canCreateInvoice.
export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);

	const jobId = event.params.id!;
	const result = await loadBillableVisits(auth.orgId, jobId);
	if (!result) error(404, 'Job not found');
	if (!canViewJob(auth.member, { assigned_to: result.job.assigned_to })) error(403, 'Forbidden');

	// Reshape without the internal `assigned_to` field (used only for the permission check above).
	const { id, title, contact_name, address, status, subtotal, completed_visit_count } = result.job;
	return json({
		data: {
			job: { id, title, contact_name, address, status, subtotal, completed_visit_count },
			visits: result.visits
		}
	});
};
