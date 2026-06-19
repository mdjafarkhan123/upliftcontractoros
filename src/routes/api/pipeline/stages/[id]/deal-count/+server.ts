import { json, error } from '@sveltejs/kit';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { opportunities, pipelineStages } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';

// Open-deal count for a single stage — powers the delete-with-move dialog so the
// UI can show "Move N deals" before the destructive DELETE is attempted.
export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!auth.member.can_manage_pipeline) error(403, 'Forbidden');

	const id = event.params.id!;

	const [stage] = await db
		.select({ id: pipelineStages.id })
		.from(pipelineStages)
		.where(
			and(
				eq(pipelineStages.id, id),
				eq(pipelineStages.org_id, auth.orgId),
				isNull(pipelineStages.deleted_at)
			)
		)
		.limit(1);
	if (!stage) error(404, 'Stage not found');

	const [{ count }] = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(opportunities)
		.where(
			and(
				eq(opportunities.org_id, auth.orgId),
				eq(opportunities.stage_id, id),
				eq(opportunities.status, 'open'),
				isNull(opportunities.deleted_at)
			)
		);

	return json({ data: { count } });
};
