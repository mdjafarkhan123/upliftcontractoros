import { json, error } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { jobs } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canViewJob } from '$lib/server/jobs/permissions';
import { loadJobVisits } from '$lib/server/jobs/visitResponse';

// List every visit (appointment) on a job with its per-visit completion record + photos (S5).
// Gate mirrors the job detail read: anyone who can view the job can see its visits (operational
// data, no money). The complete/reschedule mutations stay on the appointment status endpoint.
export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);

	const id = event.params.id!;

	const [job] = await db
		.select({ id: jobs.id, assigned_to: jobs.assigned_to })
		.from(jobs)
		.where(and(eq(jobs.id, id), eq(jobs.org_id, auth.orgId), isNull(jobs.deleted_at)))
		.limit(1);
	if (!job) error(404, 'Job not found');
	if (!canViewJob(auth.member, { assigned_to: job.assigned_to })) error(403, 'Forbidden');

	const visits = await loadJobVisits(auth.orgId, id);
	return json({ data: { visits } });
};
