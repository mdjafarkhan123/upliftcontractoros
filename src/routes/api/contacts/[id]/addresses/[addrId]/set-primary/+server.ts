import { json, error } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { contactAddresses } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';

export const PATCH: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!auth.member.can_edit_contacts) error(403, 'Forbidden');

	const [existing] = await db
		.select({ id: contactAddresses.id })
		.from(contactAddresses)
		.where(
			and(
				eq(contactAddresses.org_id, auth.orgId),
				eq(contactAddresses.id, event.params.addrId),
				eq(contactAddresses.contact_id, event.params.id),
				isNull(contactAddresses.deleted_at)
			)
		)
		.limit(1);

	if (!existing) error(404, 'Address not found');

	const updated = await db.transaction(async (tx) => {
		await tx
			.update(contactAddresses)
			.set({ is_primary: false, updated_at: new Date() })
			.where(
				and(
					eq(contactAddresses.contact_id, event.params.id),
					eq(contactAddresses.org_id, auth.orgId),
					isNull(contactAddresses.deleted_at)
				)
			);

		const [row] = await tx
			.update(contactAddresses)
			.set({ is_primary: true, updated_at: new Date() })
			.where(
				and(
					eq(contactAddresses.org_id, auth.orgId),
					eq(contactAddresses.id, event.params.addrId)
				)
			)
			.returning();
		return row;
	});

	return json({ address: updated });
};
