import { json } from '@sveltejs/kit';
import { and, asc, eq, isNull } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { bookingLinks } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { hasFeature } from '$lib/server/auth/featureGuard';

// Lightweight, sender-accessible list of active booking links for insertion in
// the inbox composer. Unlike `GET /api/booking-links` (admin-only, hard
// feature-gated for the settings UI), this returns only the fields needed to
// build a public booking URL and soft-gates the feature: if online booking is
// off, the org simply gets an empty list (the composer button won't render).
export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);

	if (!hasFeature(auth, 'feature_online_booking')) {
		return json({ data: [] });
	}

	const rows = await db
		.select({
			id: bookingLinks.id,
			slug: bookingLinks.slug,
			title: bookingLinks.title,
			appointment_type: bookingLinks.appointment_type
		})
		.from(bookingLinks)
		.where(
			and(
				eq(bookingLinks.org_id, auth.orgId),
				eq(bookingLinks.is_active, true),
				isNull(bookingLinks.deleted_at)
			)
		)
		.orderBy(asc(bookingLinks.display_order), asc(bookingLinks.created_at));

	return json({ data: rows });
};
