import { json, error } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { requests } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canManageRequests } from '$lib/server/requests/permissions';
import { loadRequestDetail } from '$lib/server/requests/detail';

// Re-open an archived request. If it had been DECLINED, unarchiving returns it
// to 'pending' — it re-enters the Needs Approval queue rather than resurrecting
// in a dead declined-but-open state.
export const POST: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canManageRequests(auth.member)) error(403, 'Forbidden');

	const [existing] = await db
		.select({
			id: requests.id,
			converted_at: requests.converted_at,
			archived_at: requests.archived_at,
			approval_state: requests.approval_state
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
		return json({ error: 'A converted request cannot be unarchived.' }, { status: 409 });
	}
	if (!existing.archived_at) {
		return json({ error: 'This request is not archived.' }, { status: 409 });
	}

	await db
		.update(requests)
		.set({
			archived_at: null,
			...(existing.approval_state === 'declined'
				? {
						approval_state: 'pending' as const,
						approval_decided_at: null,
						approval_decided_by: null
					}
				: {}),
			updated_at: new Date()
		})
		.where(eq(requests.id, existing.id));

	const detail = await loadRequestDetail(
		auth.orgId,
		existing.id,
		auth.org.timezone || 'America/Chicago'
	);
	return json({ data: detail });
};
