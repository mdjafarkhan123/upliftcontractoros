import { json, error } from '@sveltejs/kit';
import { and, asc, eq, isNull } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { appointments, jobs, jobLineItems } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canViewAppointment } from '$lib/server/appointments/permissions';

// Lean feed for the calendar's card-detail popover. A job-linked visit shows the
// parent job's customer-facing line items + grand total (Jobber's visit popover).
// Deliberately NOT the heavy GET /api/jobs/[id] (that also loads milestones,
// expenses, custom fields, timeline) — the popover only needs qty/description/total.
// Cost/margin is never returned here; this is the customer-facing price only.
export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);

	const id = event.params.id!;

	const [appt] = await db
		.select({ job_id: appointments.job_id, assigned_to: appointments.assigned_to })
		.from(appointments)
		.where(
			and(
				eq(appointments.id, id),
				eq(appointments.org_id, auth.orgId),
				isNull(appointments.deleted_at)
			)
		)
		.limit(1);

	if (!appt) error(404, 'Appointment not found');
	if (!canViewAppointment(auth.member, { assigned_to: appt.assigned_to })) error(403, 'Forbidden');

	// Standalone visit (estimate/callback/inspection, no job) → nothing to price.
	if (!appt.job_id) {
		return json({ data: { has_job: false, line_items: [], total: null } });
	}

	const [job] = await db
		.select({ total: jobs.total })
		.from(jobs)
		.where(and(eq(jobs.id, appt.job_id), eq(jobs.org_id, auth.orgId), isNull(jobs.deleted_at)))
		.limit(1);

	if (!job) {
		return json({ data: { has_job: false, line_items: [], total: null } });
	}

	const items = await db
		.select({
			line_key: jobLineItems.line_key,
			description: jobLineItems.description,
			quantity: jobLineItems.quantity,
			unit: jobLineItems.unit,
			total: jobLineItems.total
		})
		.from(jobLineItems)
		.where(
			and(
				eq(jobLineItems.job_id, appt.job_id),
				eq(jobLineItems.org_id, auth.orgId),
				isNull(jobLineItems.deleted_at)
			)
		)
		.orderBy(asc(jobLineItems.position));

	return json({
		data: {
			has_job: true,
			job_id: appt.job_id,
			total: job.total,
			line_items: items
		}
	});
};
