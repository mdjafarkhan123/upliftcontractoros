import { json, error } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { outboxEvents, requests } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canManageRequests } from '$lib/server/requests/permissions';
import { loadRequestDetail } from '$lib/server/requests/detail';

// Accept a needs-approval request (public submission with the approval gate on).
// Flips the approval fact only — the assessment slot the client picked (if any)
// simply stays. Jobber's "Accept and Schedule" then opens the schedule UI, which
// is client-side navigation, not this endpoint's job.
export const POST: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canManageRequests(auth.member)) error(403, 'Forbidden');

	const [existing] = await db
		.select({
			id: requests.id,
			approval_state: requests.approval_state,
			contact_id: requests.contact_id
		})
		.from(requests)
		.where(
			and(
				eq(requests.id, event.params.id),
				eq(requests.org_id, auth.orgId),
				isNull(requests.deleted_at)
			)
		)
		.limit(1);
	if (!existing) return json({ error: 'Request not found' }, { status: 404 });
	if (existing.approval_state !== 'pending') {
		return json({ error: 'This request is not awaiting approval.' }, { status: 409 });
	}

	await db.transaction(async (tx) => {
		const now = new Date();
		await tx
			.update(requests)
			.set({
				approval_state: 'accepted',
				approval_decided_at: now,
				approval_decided_by: auth.member.id,
				updated_at: now
			})
			.where(eq(requests.id, existing.id));

		await tx.insert(outboxEvents).values({
			org_id: auth.orgId,
			event_type: 'request.accepted',
			resource_type: 'request',
			resource_id: existing.id,
			payload: { request_id: existing.id, org_id: auth.orgId, contact_id: existing.contact_id },
			idempotency_key: `request.accepted:${existing.id}`
		});
	});

	const detail = await loadRequestDetail(
		auth.orgId,
		existing.id,
		auth.org.timezone || 'America/Chicago'
	);
	return json({ data: detail });
};
