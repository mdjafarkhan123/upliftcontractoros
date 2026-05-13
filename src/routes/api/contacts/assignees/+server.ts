import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { listActiveAssignees } from '$lib/server/contacts/contactRepo';

export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);

	// Anyone who can create or edit contacts needs the assignee picker.
	if (!auth.member.can_create_contacts && !auth.member.can_edit_contacts) {
		error(403, 'Forbidden');
	}

	const assignees = await listActiveAssignees(auth.orgId);
	return json({ assignees });
};
