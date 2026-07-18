import { json, error } from '@sveltejs/kit';
import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import {
	availabilityOverrides,
	availabilityWindows,
	bookingFormFields,
	bookingLinks
} from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { requireFeature } from '$lib/server/auth/featureGuard';
import { loadBookingLinkForOrg } from '$lib/server/booking/loadBookingLink';
import {
	defaultRequestFormFieldRows,
	toBuilderFields,
	toBuilderCustomFields
} from '$lib/server/booking/formFields';

const updateSchema = z.object({
	title: z.string().trim().min(1).max(120).optional(),
	description: z.string().trim().max(2000).nullable().optional(),
	form_type: z.enum(['booking', 'request']).optional(),
	requires_approval: z.boolean().optional(),
	appointment_type: z
		.enum(['estimate', 'job_start', 'follow_up', 'inspection', 'other'])
		.optional(),
	slot_duration_minutes: z
		.union([z.literal(30), z.literal(45), z.literal(60), z.literal(90), z.literal(120)])
		.optional(),
	buffer_minutes: z.union([z.literal(0), z.literal(15), z.literal(30)]).optional(),
	min_advance_hours: z.union([z.literal(1), z.literal(4), z.literal(24), z.literal(48)]).optional(),
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

	// Windows, overrides, and form-builder fields all hang off the (already-gated)
	// link and are independent of each other — fire them in one wave instead of
	// three sequential round trips (Rule 24).
	const [windows, overrides, fieldRows] = await Promise.all([
		db
			.select()
			.from(availabilityWindows)
			.where(eq(availabilityWindows.booking_link_id, link.id))
			.orderBy(asc(availabilityWindows.day_of_week), asc(availabilityWindows.start_time)),
		db
			.select()
			.from(availabilityOverrides)
			.where(eq(availabilityOverrides.booking_link_id, link.id))
			.orderBy(asc(availabilityOverrides.override_date)),
		db
			.select()
			.from(bookingFormFields)
			.where(eq(bookingFormFields.booking_link_id, link.id))
			.orderBy(asc(bookingFormFields.position))
	]);

	return json({
		data: {
			...link,
			windows,
			overrides,
			fields: toBuilderFields(fieldRows),
			custom_fields: toBuilderCustomFields(fieldRows)
		}
	});
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

	// Changing a form's type must not carry its default flag across: the default
	// is scoped to (org, form_type), and a stale default on the new type could
	// collide with that type's existing default (partial unique index). Drop it —
	// the admin re-picks a default on the Requests-and-bookings hub.
	if (parsed.data.form_type !== undefined && parsed.data.form_type !== link.form_type) {
		updates.is_default = false;
	}

	const [updated] = await db
		.update(bookingLinks)
		.set(updates)
		.where(and(eq(bookingLinks.id, link.id), eq(bookingLinks.org_id, auth.orgId)))
		.returning();

	// If this switched the form into a request form, make sure it has the default
	// builder fields (a form created as 'booking' has none). Idempotent — only
	// seeds when the form has no field rows yet.
	if (updated.form_type === 'request') {
		const [existingField] = await db
			.select({ id: bookingFormFields.id })
			.from(bookingFormFields)
			.where(eq(bookingFormFields.booking_link_id, link.id))
			.limit(1);
		if (!existingField) {
			await db
				.insert(bookingFormFields)
				.values(defaultRequestFormFieldRows(auth.orgId, link.id));
		}
	}

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
