import { json, error } from '@sveltejs/kit';
import { and, eq, isNull, ne } from 'drizzle-orm';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { bookingLinks } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { requireFeature } from '$lib/server/auth/featureGuard';
import { loadBookingLinkForOrg } from '$lib/server/booking/loadBookingLink';

const bodySchema = z.object({ is_default: z.boolean() });

// Set (or clear) this form as the org's default FOR ITS form_type. A booking
// form and a request form can each be default independently. Because at most one
// default is allowed per (org, form_type) (partial unique index), turning one ON
// must turn its same-type siblings OFF atomically — done in one transaction.
export const POST: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (auth.member.role !== 'admin') error(403, 'Admin only.');
	requireFeature(auth, 'feature_online_booking');

	const link = await loadBookingLinkForOrg(auth.orgId, event.params.id!);

	let raw: unknown;
	try {
		raw = await event.request.json();
	} catch {
		return json({ error: 'Invalid JSON.' }, { status: 400 });
	}

	const parsed = bodySchema.safeParse(raw);
	if (!parsed.success) {
		return json({ error: 'Validation failed.' }, { status: 400 });
	}

	const updated = await db.transaction(async (tx) => {
		if (parsed.data.is_default) {
			// Clear the current default of this type first (skip self), then set self.
			await tx
				.update(bookingLinks)
				.set({ is_default: false, updated_at: new Date() })
				.where(
					and(
						eq(bookingLinks.org_id, auth.orgId),
						eq(bookingLinks.form_type, link.form_type),
						eq(bookingLinks.is_default, true),
						ne(bookingLinks.id, link.id),
						isNull(bookingLinks.deleted_at)
					)
				);
		}

		const [row] = await tx
			.update(bookingLinks)
			.set({ is_default: parsed.data.is_default, updated_at: new Date() })
			.where(and(eq(bookingLinks.id, link.id), eq(bookingLinks.org_id, auth.orgId)))
			.returning();
		return row;
	});

	return json({ data: updated });
};
