import { json, error } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { bookingLinks } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { requireFeature } from '$lib/server/auth/featureGuard';

const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (auth.member.role !== 'admin') error(403, 'Admin only.');
	requireFeature(auth, 'feature_online_booking');

	const raw = event.url.searchParams.get('slug') ?? '';
	const slug = raw.trim().toLowerCase();

	if (slug.length < 3 || slug.length > 60 || !slugRegex.test(slug)) {
		return json({ data: { available: false, reason: 'invalid' as const } });
	}

	const [existing] = await db
		.select({ id: bookingLinks.id })
		.from(bookingLinks)
		.where(
			and(
				eq(bookingLinks.org_id, auth.orgId),
				eq(bookingLinks.slug, slug),
				isNull(bookingLinks.deleted_at)
			)
		)
		.limit(1);

	return json({ data: { available: !existing } });
};
