// Tier 1 calendar eligibility for a month. Public route — no session required.
// Engine is stateless; no caching.

import { json } from '@sveltejs/kit';
import { and, eq, sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { bookingLinks, organizations } from '$lib/server/db/schema';
import { getEligibleDatesForMonth, BookingValidationError } from '$lib/server/booking';
import { assertIsoMonth } from '$lib/server/booking/timezone/utils';

const NO_STORE = { 'Cache-Control': 'no-store' };

function notFound(): Response {
	return json({ error: 'Not found' }, { status: 404, headers: NO_STORE });
}

export const GET: RequestHandler = async ({ params, url }) => {
	const orgSlug = params.orgSlug!;
	const bookingSlug = params.bookingSlug!;
	const monthParam = url.searchParams.get('month');

	if (!monthParam) {
		return json(
			{ error: 'month is required', field_errors: { month: 'Required (YYYY-MM)' } },
			{ status: 400, headers: NO_STORE }
		);
	}

	let month: string;
	try {
		month = assertIsoMonth(monthParam);
	} catch (err) {
		if (err instanceof BookingValidationError) {
			return json(
				{ error: err.message, field_errors: { month: err.message } },
				{ status: 400, headers: NO_STORE }
			);
		}
		throw err;
	}

	const [link] = await db
		.select({
			id: bookingLinks.id,
			min_advance_hours: bookingLinks.min_advance_hours,
			max_future_days: bookingLinks.max_future_days,
			timezone: organizations.timezone
		})
		.from(bookingLinks)
		.innerJoin(organizations, eq(organizations.id, bookingLinks.org_id))
		.where(
			and(
				eq(organizations.slug, orgSlug),
				eq(organizations.status, 'active'),
				sql`${organizations.deleted_at} IS NULL`,
				eq(organizations.feature_online_booking, true),
				eq(bookingLinks.slug, bookingSlug),
				eq(bookingLinks.is_active, true),
				sql`${bookingLinks.deleted_at} IS NULL`
			)
		)
		.limit(1);

	if (!link) return notFound();

	const dates = await getEligibleDatesForMonth({
		timezone: link.timezone,
		bookingLink: {
			id: link.id,
			min_advance_hours: link.min_advance_hours,
			max_future_days: link.max_future_days
		},
		month
	});

	return json({ data: { dates } }, { headers: NO_STORE });
};
