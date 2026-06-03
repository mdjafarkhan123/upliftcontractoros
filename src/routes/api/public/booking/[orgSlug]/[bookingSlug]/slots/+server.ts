// Tier 2 full slot generation for a single date. Public route — no session required.
// Engine is stateless; no caching.

import { json } from '@sveltejs/kit';
import { and, eq, sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { bookingLinks, organizations } from '$lib/server/db/schema';
import { generateSlotsForDate, BookingValidationError } from '$lib/server/booking';
import { assertIsoDate } from '$lib/server/booking/timezone/utils';

const NO_STORE = { 'Cache-Control': 'no-store' };

function notFound(): Response {
	return json({ error: 'Not found' }, { status: 404, headers: NO_STORE });
}

export const GET: RequestHandler = async ({ params, url }) => {
	const orgSlug = params.orgSlug!;
	const bookingSlug = params.bookingSlug!;
	const dateParam = url.searchParams.get('date');

	if (!dateParam) {
		return json(
			{ error: 'date is required', field_errors: { date: 'Required (YYYY-MM-DD)' } },
			{ status: 400, headers: NO_STORE }
		);
	}

	// Format validation BEFORE any DB query.
	let date: string;
	try {
		date = assertIsoDate(dateParam);
	} catch (err) {
		if (err instanceof BookingValidationError) {
			return json(
				{ error: err.message, field_errors: { date: err.message } },
				{ status: 400, headers: NO_STORE }
			);
		}
		throw err;
	}

	const [link] = await db
		.select({
			id: bookingLinks.id,
			org_id: bookingLinks.org_id,
			slot_duration_minutes: bookingLinks.slot_duration_minutes,
			buffer_minutes: bookingLinks.buffer_minutes,
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

	try {
		const slots = await generateSlotsForDate({
			orgId: link.org_id,
			timezone: link.timezone,
			bookingLink: {
				id: link.id,
				slot_duration_minutes: link.slot_duration_minutes,
				buffer_minutes: link.buffer_minutes,
				min_advance_hours: link.min_advance_hours,
				max_future_days: link.max_future_days
			},
			date
		});

		return json({ data: { slots: slots.map((d) => d.toISOString()) } }, { headers: NO_STORE });
	} catch (err) {
		if (err instanceof BookingValidationError) {
			return json(
				{ error: err.message, field_errors: err.field ? { [err.field]: err.message } : undefined },
				{ status: 400, headers: NO_STORE }
			);
		}
		throw err;
	}
};
