import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { listActiveAssignees } from '$lib/server/contacts/contactRepo';
import {
	canCreateAppointment,
	canRescheduleAppointment
} from '$lib/server/appointments/permissions';

export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);

	if (!canCreateAppointment(auth.member) && !canRescheduleAppointment(auth.member)) {
		error(403, 'Forbidden');
	}

	const assignees = await listActiveAssignees(auth.orgId);
	return json({ assignees });
};
