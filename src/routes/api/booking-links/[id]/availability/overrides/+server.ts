import { json, error } from '@sveltejs/kit';
import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { availabilityOverrides } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { requireFeature } from '$lib/server/auth/featureGuard';
import { loadBookingLinkForOrg } from '$lib/server/booking/loadBookingLink';
import { todayInOrgTz } from '$lib/server/booking/timezone/utils';

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
const timeRegex = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

const createSchema = z
	.object({
		override_date: z.string().regex(dateRegex, 'Use YYYY-MM-DD.'),
		is_blocked: z.boolean(),
		start_time: z.string().regex(timeRegex).optional().nullable(),
		end_time: z.string().regex(timeRegex).optional().nullable(),
		reason: z.string().trim().max(500).optional().nullable()
	})
	.refine(
		(v) => v.is_blocked || (v.start_time && v.end_time),
		{
			message: 'Start time and end time are required when not blocking the day.',
			path: ['start_time']
		}
	);

function adminGuard(auth: NonNullable<App.Locals['auth']>) {
	if (auth.member.role !== 'admin') error(403, 'Admin only.');
}

function toMinutes(t: string): number {
	const [h, m] = t.split(':');
	return Number(h) * 60 + Number(m);
}

export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	adminGuard(auth);
	requireFeature(auth, 'feature_online_booking');

	const link = await loadBookingLinkForOrg(auth.orgId, event.params.id!);

	const rows = await db
		.select()
		.from(availabilityOverrides)
		.where(eq(availabilityOverrides.booking_link_id, link.id))
		.orderBy(asc(availabilityOverrides.override_date));

	return json({ data: rows });
};

export const POST: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	adminGuard(auth);
	requireFeature(auth, 'feature_online_booking');

	const link = await loadBookingLinkForOrg(auth.orgId, event.params.id!);

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Invalid JSON.' }, { status: 400 });
	}

	const parsed = createSchema.safeParse(body);
	if (!parsed.success) {
		const field_errors: Record<string, string> = {};
		for (const issue of parsed.error.issues) {
			const key = issue.path[0]?.toString();
			if (key && !field_errors[key]) field_errors[key] = issue.message;
		}
		return json({ error: 'Validation failed.', field_errors }, { status: 400 });
	}

	const input = parsed.data;

	const today = todayInOrgTz(auth.org.timezone);
	if (input.override_date < today) {
		return json(
			{ error: 'Cannot block a date in the past.', field_errors: { override_date: 'Must be today or later.' } },
			{ status: 400 }
		);
	}

	if (!input.is_blocked && input.start_time && input.end_time) {
		if (toMinutes(input.end_time) <= toMinutes(input.start_time)) {
			return json(
				{ error: 'End time must be after start time.', field_errors: { end_time: 'Must be after start.' } },
				{ status: 400 }
			);
		}
	}

	const [existing] = await db
		.select({ id: availabilityOverrides.id })
		.from(availabilityOverrides)
		.where(
			and(
				eq(availabilityOverrides.booking_link_id, link.id),
				eq(availabilityOverrides.override_date, input.override_date)
			)
		)
		.limit(1);

	if (existing) {
		return json(
			{ error: 'This date already has an override.', field_errors: { override_date: 'Already set.' } },
			{ status: 409 }
		);
	}

	const normalize = (t: string | null | undefined) =>
		t ? (t.length === 5 ? `${t}:00` : t) : null;

	const [created] = await db
		.insert(availabilityOverrides)
		.values({
			booking_link_id: link.id,
			override_date: input.override_date,
			is_blocked: input.is_blocked,
			start_time: input.is_blocked ? null : normalize(input.start_time),
			end_time: input.is_blocked ? null : normalize(input.end_time),
			reason: input.reason ?? null
		})
		.returning();

	return json({ data: created }, { status: 201 });
};
