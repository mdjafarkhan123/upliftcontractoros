import { json, error } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { contacts } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { loadContactOverview } from '$lib/server/contacts/contactRepo';

export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);

	// Cheap existence + access check before the overview query. Restricted
	// members (no can_view_all_contacts) only see contacts assigned to them; we
	// return 404 (not 403) so we never leak the existence of other contacts.
	const [contact] = await db
		.select({ assigned_to: contacts.assigned_to })
		.from(contacts)
		.where(
			and(
				eq(contacts.org_id, auth.orgId),
				eq(contacts.id, event.params.id),
				isNull(contacts.deleted_at)
			)
		)
		.limit(1);

	if (!contact) error(404, 'Contact not found');
	if (!auth.member.can_view_all_contacts && contact.assigned_to !== auth.member.id) {
		error(404, 'Contact not found');
	}

	const overview = await loadContactOverview(auth.orgId, event.params.id);
	return json(overview);
};
