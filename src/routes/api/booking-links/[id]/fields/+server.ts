// R5.2 — form-builder field config. Admin-gated. Updates the show/hide + required
// flags on a request form's standardized fields. Locked fields (name / phone /
// service details) can't be reconfigured and are silently ignored.

import { json, error } from '@sveltejs/kit';
import { and, asc, eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { bookingFormFields } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { requireFeature } from '$lib/server/auth/featureGuard';
import { loadBookingLinkForOrg } from '$lib/server/booking/loadBookingLink';
import { toBuilderFields, updateFormFieldsSchema } from '$lib/server/booking/formFields';

export const PATCH: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (auth.member.role !== 'admin') error(403, 'Admin only.');
	requireFeature(auth, 'feature_online_booking');

	const link = await loadBookingLinkForOrg(auth.orgId, event.params.id!);

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Invalid JSON.' }, { status: 400 });
	}

	const parsed = updateFormFieldsSchema.safeParse(body);
	if (!parsed.success) {
		return json({ error: 'Validation failed.' }, { status: 400 });
	}

	// Load the form's current rows so we only touch rows that belong to this link
	// and are neither locked nor custom. Unknown/locked ids are ignored (never
	// trusted from the client).
	const rows = await db
		.select()
		.from(bookingFormFields)
		.where(eq(bookingFormFields.booking_link_id, link.id));
	const byId = new Map(rows.map((r) => [r.id, r]));

	const editable = parsed.data.fields.filter((u) => {
		const row = byId.get(u.id);
		return row && !row.is_locked && row.kind === 'standard';
	});

	if (editable.length > 0) {
		await db.transaction(async (tx) => {
			for (const u of editable) {
				await tx
					.update(bookingFormFields)
					.set({ is_enabled: u.is_enabled, is_required: u.is_required, updated_at: new Date() })
					.where(
						and(
							eq(bookingFormFields.id, u.id),
							eq(bookingFormFields.booking_link_id, link.id),
							eq(bookingFormFields.org_id, auth.orgId)
						)
					);
			}
		});
	}

	// Write-through: return the fresh field list so the client patches its state.
	const fresh = await db
		.select()
		.from(bookingFormFields)
		.where(eq(bookingFormFields.booking_link_id, link.id))
		.orderBy(asc(bookingFormFields.position));

	return json({ data: { fields: toBuilderFields(fresh) } });
};
