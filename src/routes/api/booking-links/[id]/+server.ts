import { json, error } from '@sveltejs/kit';
import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import {
	availabilityOverrides,
	availabilityWindows,
	bookingLinks
} from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { requireFeature } from '$lib/server/auth/featureGuard';
import { loadBookingLinkForOrg } from '$lib/server/booking/loadBookingLink';

const updateSchema = z.object({
	title: z.string().trim().min(1).max(120).optional(),
	description: z.string().trim().max(2000).nullable().optional(),
	appointment_type: z
		.enum(['estimate', 'job_start', 'follow_up', 'inspection', 'other'])
		.optional(),
	slot_duration_minutes: z
		.union([z.literal(30), z.literal(45), z.literal(60), z.literal(90), z.literal(120)])
		.optional(),
	buffer_minutes: z
		.union([z.literal(0), z.literal(15), z.literal(30)])
		.optional(),
	min_advance_hours: z
		.union([z.literal(1), z.literal(4), z.literal(24), z.literal(48)])
		.optional(),
	max_future_days: z.union([z.literal(14), z.literal(30), z.literal(60)]).optional(),
	is_active: z.boolean().optional()
});

function adminGuard(auth: NonNullable<App.Locals['auth']>) {
	if (auth.member.role !== 'admin') error(403, 'Admin only.');
}

export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	adminGuard(auth);
	requireFeature(auth, 'feature_online_booking');

	const link = await loadBookingLinkForOrg(auth.orgId, event.params.id!);

	const windows = await db
		.select()
		.from(availabilityWindows)
		.where(eq(availabilityWindows.booking_link_id, link.id))
		.orderBy(asc(availabilityWindows.day_of_week), asc(availabilityWindows.start_time));

	const overrides = await db
		.select()
		.from(availabilityOverrides)
		.where(eq(availabilityOverrides.booking_link_id, link.id))
		.orderBy(asc(availabilityOverrides.override_date));

	return json({ data: { ...link, windows, overrides } });
};

export const PATCH: RequestHandler = async (event) => {
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

	const parsed = updateSchema.safeParse(body);
	if (!parsed.success) {
		const field_errors: Record<string, string> = {};
		for (const issue of parsed.error.issues) {
			const key = issue.path[0]?.toString();
			if (key && !field_errors[key]) field_errors[key] = issue.message;
		}
		return json({ error: 'Validation failed.', field_errors }, { status: 400 });
	}

	const updates: Record<string, unknown> = { updated_at: new Date() };
	for (const [k, v] of Object.entries(parsed.data)) {
		if (v !== undefined) updates[k] = v;
	}

	if (Object.keys(updates).length === 1) {
		return json({ error: 'No fields to update.' }, { status: 400 });
	}

	const [updated] = await db
		.update(bookingLinks)
		.set(updates)
		.where(and(eq(bookingLinks.id, link.id), eq(bookingLinks.org_id, auth.orgId)))
		.returning();

	return json({ data: updated });
};

export const DELETE: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	adminGuard(auth);
	requireFeature(auth, 'feature_online_booking');

	const link = await loadBookingLinkForOrg(auth.orgId, event.params.id!);

	await db
		.update(bookingLinks)
		.set({ deleted_at: new Date(), is_active: false, updated_at: new Date() })
		.where(and(eq(bookingLinks.id, link.id), eq(bookingLinks.org_id, auth.orgId)));

	return new Response(null, { status: 204 });
};
