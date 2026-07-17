import { json, error } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { opportunities, opportunityFollowUps } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canViewOpportunity } from '$lib/server/pipeline/permissions';
import { loadOpportunityFollowUps } from '$lib/server/pipeline/followUps';
import { logFollowUpSchema } from '$lib/server/pipeline/schemas';

export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);

	const id = event.params.id!;
	const [opp] = await db
		.select({ id: opportunities.id, assigned_to: opportunities.assigned_to })
		.from(opportunities)
		.where(
			and(
				eq(opportunities.id, id),
				eq(opportunities.org_id, auth.orgId),
				isNull(opportunities.deleted_at)
			)
		)
		.limit(1);

	if (!opp) error(404, 'Opportunity not found');
	if (!canViewOpportunity(auth.member, opp)) error(403, 'Forbidden');

	const follow_ups = await loadOpportunityFollowUps(auth.orgId, id, 20);
	return json({ data: { follow_ups } });
};

export const POST: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!auth.member.can_move_pipeline_stages) error(403, 'Forbidden');

	const id = event.params.id!;

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		error(400, 'Invalid JSON body');
	}

	const parsed = logFollowUpSchema.safeParse(body);
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 422 });
	}

	const [opp] = await db
		.select({ id: opportunities.id, assigned_to: opportunities.assigned_to })
		.from(opportunities)
		.where(
			and(
				eq(opportunities.id, id),
				eq(opportunities.org_id, auth.orgId),
				isNull(opportunities.deleted_at)
			)
		)
		.limit(1);

	if (!opp) error(404, 'Opportunity not found');
	if (!canViewOpportunity(auth.member, opp)) error(404, 'Opportunity not found');

	const [inserted] = await db
		.insert(opportunityFollowUps)
		.values({
			org_id: auth.orgId,
			opportunity_id: id,
			logged_by: auth.member.id,
			outcome: parsed.data.outcome,
			note: parsed.data.note ?? null,
			occurred_at: new Date()
		})
		.returning();

	return json(
		{
			data: {
				follow_up: {
					id: inserted.id,
					logged_by: inserted.logged_by,
					logged_by_name: auth.member.full_name,
					outcome: inserted.outcome,
					note: inserted.note,
					occurred_at: inserted.occurred_at.toISOString()
				}
			}
		},
		{ status: 201 }
	);
};
