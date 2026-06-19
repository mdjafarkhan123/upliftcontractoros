import { json, error } from '@sveltejs/kit';
import { and, eq, inArray, desc } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { automationEnrollments, automationSequences } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';

/**
 * List the live (active/paused) automation enrollments for a contact — powers the
 * "Active automations" panel + universal Stop button (Stage 3.d.2). Read-only, so
 * any authenticated org member can see it; stopping is gated separately on
 * can_send_messages in the [id]/stop route. Only non-terminal enrollments are
 * returned — those are the only ones a staff member can act on.
 */
export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);

	const contactId = event.url.searchParams.get('contact_id');
	if (!contactId) error(400, 'contact_id is required');

	const rows = await db
		.select({
			id: automationEnrollments.id,
			sequence_key: automationSequences.key,
			status: automationEnrollments.status,
			resource_type: automationEnrollments.resource_type,
			next_step_at: automationEnrollments.next_step_at,
			paused_until: automationEnrollments.paused_until
		})
		.from(automationEnrollments)
		.innerJoin(automationSequences, eq(automationEnrollments.sequence_id, automationSequences.id))
		.where(
			and(
				eq(automationEnrollments.org_id, auth.orgId),
				eq(automationEnrollments.contact_id, contactId),
				inArray(automationEnrollments.status, ['active', 'paused'])
			)
		)
		.orderBy(desc(automationEnrollments.started_at));

	return json({ data: rows });
};
