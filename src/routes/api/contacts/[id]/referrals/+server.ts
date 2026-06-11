import { json, error } from '@sveltejs/kit';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { contacts } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';

export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);

	const contactId = event.params.id;

	const [exists] = await db
		.select({ id: contacts.id, assigned_to: contacts.assigned_to })
		.from(contacts)
		.where(
			and(eq(contacts.org_id, auth.orgId), eq(contacts.id, contactId), isNull(contacts.deleted_at))
		)
		.limit(1);

	if (!exists) error(404, 'Contact not found');
	if (!auth.member.can_view_all_contacts && exists.assigned_to !== auth.member.id) {
		error(404, 'Contact not found');
	}

	const referrals = await db
		.select({
			id: contacts.id,
			full_name: contacts.full_name,
			phone: contacts.phone,
			status: contacts.status,
			created_at: contacts.created_at
		})
		.from(contacts)
		.where(
			and(
				eq(contacts.org_id, auth.orgId),
				eq(contacts.referred_by_contact_id, contactId),
				isNull(contacts.deleted_at),
				sql`(${contacts.phone} IS NULL OR ${contacts.phone} NOT LIKE 'RELEASED:%')`
			)
		)
		.orderBy(sql`${contacts.created_at} DESC`);

	return json({ referrals });
};
