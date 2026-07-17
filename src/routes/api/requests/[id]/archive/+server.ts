import { json, error } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { outboxEvents, requests } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canManageRequests } from '$lib/server/requests/permissions';
import { loadRequestDetail } from '$lib/server/requests/detail';

// Close a request without converting it (Jobber "Archive"). One of the four
// choices in the assessment-completed popup; also available any time from ⋯.
export const POST: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canManageRequests(auth.member)) error(403, 'Forbidden');

	const [existing] = await db
		.select({
			id: requests.id,
			converted_at: requests.converted_at,
			archived_at: requests.archived_at,
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
	if (existing.converted_at) {
		return json({ error: 'A converted request cannot be archived.' }, { status: 409 });
	}
	if (existing.archived_at) {
		return json({ error: 'This request is already archived.' }, { status: 409 });
	}

	await db.transaction(async (tx) => {
		const now = new Date();
		await tx
			.update(requests)
			.set({ archived_at: now, updated_at: now })
			.where(eq(requests.id, existing.id));

		await tx.insert(outboxEvents).values({
			org_id: auth.orgId,
			event_type: 'request.archived',
			resource_type: 'request',
			resource_id: existing.id,
			payload: { request_id: existing.id, org_id: auth.orgId, contact_id: existing.contact_id },
			idempotency_key: `request.archived:${existing.id}:${now.getTime()}`
		});
	});

	const detail = await loadRequestDetail(
		auth.orgId,
		existing.id,
		auth.org.timezone || 'America/Chicago'
	);
	return json({ data: detail });
};
