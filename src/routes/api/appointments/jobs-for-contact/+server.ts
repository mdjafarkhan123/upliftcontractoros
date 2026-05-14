import { json, error } from '@sveltejs/kit';
import { and, desc, eq, isNull } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { jobs } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canCreateAppointment, canRescheduleAppointment } from '$lib/server/appointments/permissions';

export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);

	if (!canCreateAppointment(auth.member) && !canRescheduleAppointment(auth.member)) {
		error(403, 'Forbidden');
	}

	const contactId = event.url.searchParams.get('contact_id');
	if (!contactId) return json({ error: 'contact_id is required' }, { status: 400 });

	const rows = await db
		.select({
			id: jobs.id,
			title: jobs.title,
			status: jobs.status
		})
		.from(jobs)
		.where(
			and(
				eq(jobs.org_id, auth.orgId),
				eq(jobs.contact_id, contactId),
				isNull(jobs.deleted_at)
			)
		)
		.orderBy(desc(jobs.created_at))
		.limit(50);

	return json({ items: rows });
};
