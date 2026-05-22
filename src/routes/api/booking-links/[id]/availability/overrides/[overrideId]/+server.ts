import { error } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { availabilityOverrides } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { requireFeature } from '$lib/server/auth/featureGuard';
import { loadBookingLinkForOrg } from '$lib/server/booking/loadBookingLink';

export const DELETE: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (auth.member.role !== 'admin') error(403, 'Admin only.');
	requireFeature(auth, 'feature_online_booking');

	const link = await loadBookingLinkForOrg(auth.orgId, event.params.id!);

	const deleted = await db
		.delete(availabilityOverrides)
		.where(
			and(
				eq(availabilityOverrides.id, event.params.overrideId!),
				eq(availabilityOverrides.booking_link_id, link.id)
			)
		)
		.returning({ id: availabilityOverrides.id });

	if (deleted.length === 0) error(404, 'Not found');

	return new Response(null, { status: 204 });
};
