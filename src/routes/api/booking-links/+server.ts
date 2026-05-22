import { json, error } from '@sveltejs/kit';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { availabilityWindows, bookingLinks } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { requireFeature } from '$lib/server/auth/featureGuard';

const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const createSchema = z.object({
	slug: z
		.string()
		.trim()
		.toLowerCase()
		.min(3, 'Slug must be at least 3 characters.')
		.max(60, 'Slug must be 60 characters or fewer.')
		.regex(slugRegex, 'Use lowercase letters, numbers, and hyphens only.'),
	title: z.string().trim().min(1, 'Title is required.').max(120),
	description: z.string().trim().max(2000).optional().nullable(),
	appointment_type: z.enum(['estimate', 'job_start', 'follow_up', 'inspection', 'other']),
	slot_duration_minutes: z.union([
		z.literal(30),
		z.literal(45),
		z.literal(60),
		z.literal(90),
		z.literal(120)
	]),
	buffer_minutes: z.union([z.literal(0), z.literal(15), z.literal(30)]),
	min_advance_hours: z.union([z.literal(1), z.literal(4), z.literal(24), z.literal(48)]),
	max_future_days: z.union([z.literal(14), z.literal(30), z.literal(60)])
});

const DEFAULT_WINDOWS = [1, 2, 3, 4, 5].map((dow) => ({
	day_of_week: dow,
	start_time: '08:00:00',
	end_time: '17:00:00'
}));

export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (auth.member.role !== 'admin') error(403, 'Admin only.');
	requireFeature(auth, 'feature_online_booking');

	const rows = await db
		.select({
			id: bookingLinks.id,
			slug: bookingLinks.slug,
			title: bookingLinks.title,
			description: bookingLinks.description,
			appointment_type: bookingLinks.appointment_type,
			slot_duration_minutes: bookingLinks.slot_duration_minutes,
			buffer_minutes: bookingLinks.buffer_minutes,
			min_advance_hours: bookingLinks.min_advance_hours,
			max_future_days: bookingLinks.max_future_days,
			is_active: bookingLinks.is_active,
			created_at: bookingLinks.created_at,
			window_count: sql<number>`(
				SELECT COUNT(*)::int FROM ${availabilityWindows}
				WHERE ${availabilityWindows.booking_link_id} = ${bookingLinks.id}
			)`,
			override_count: sql<number>`(
				SELECT COUNT(*)::int FROM availability_overrides
				WHERE availability_overrides.booking_link_id = ${bookingLinks.id}
			)`
		})
		.from(bookingLinks)
		.where(and(eq(bookingLinks.org_id, auth.orgId), isNull(bookingLinks.deleted_at)))
		.orderBy(asc(bookingLinks.created_at));

	return json({ data: rows });
};

export const POST: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (auth.member.role !== 'admin') error(403, 'Admin only.');
	requireFeature(auth, 'feature_online_booking');

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

	const [existing] = await db
		.select({ id: bookingLinks.id })
		.from(bookingLinks)
		.where(
			and(
				eq(bookingLinks.org_id, auth.orgId),
				eq(bookingLinks.slug, input.slug),
				isNull(bookingLinks.deleted_at)
			)
		)
		.limit(1);

	if (existing) {
		return json(
			{ error: 'A booking link with this slug already exists.', field_errors: { slug: 'Already in use.' } },
			{ status: 409 }
		);
	}

	const created = await db.transaction(async (tx) => {
		const [link] = await tx
			.insert(bookingLinks)
			.values({
				org_id: auth.orgId,
				slug: input.slug,
				title: input.title,
				description: input.description ?? null,
				appointment_type: input.appointment_type,
				slot_duration_minutes: input.slot_duration_minutes,
				buffer_minutes: input.buffer_minutes,
				min_advance_hours: input.min_advance_hours,
				max_future_days: input.max_future_days,
				is_active: true
			})
			.returning();

		await tx.insert(availabilityWindows).values(
			DEFAULT_WINDOWS.map((w) => ({
				booking_link_id: link.id,
				day_of_week: w.day_of_week,
				start_time: w.start_time,
				end_time: w.end_time
			}))
		);

		return link;
	});

	return json({ data: created }, { status: 201 });
};
