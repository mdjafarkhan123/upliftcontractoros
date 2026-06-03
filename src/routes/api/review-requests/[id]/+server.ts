import { json, error } from '@sveltejs/kit';
import { and, eq, isNull, inArray } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { reviewRequests } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canSendReviewRequests } from '$lib/server/reputation/permissions';

// Soft-delete cancel. Worker hot paths filter `isNull(deleted_at)` already
// (see automationWorker.loadActiveReviewRequest), so any pre-scheduled BullMQ
// jobs will load null and no-op. Blocked on terminal rows — nothing to cancel.
export const DELETE: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canSendReviewRequests(auth.member)) error(403, 'Forbidden');

	const id = event.params.id!;

	const updated = await db
		.update(reviewRequests)
		.set({ deleted_at: new Date(), updated_at: new Date() })
		.where(
			and(
				eq(reviewRequests.id, id),
				eq(reviewRequests.org_id, auth.orgId),
				isNull(reviewRequests.deleted_at),
				inArray(reviewRequests.status, ['scheduled', 'sent', 'engaged'])
			)
		)
		.returning({ id: reviewRequests.id });

	if (updated.length === 0) {
		return json(
			{ error: 'Review request not found or already in a terminal state.' },
			{ status: 404 }
		);
	}

	return new Response(null, { status: 204 });
};
