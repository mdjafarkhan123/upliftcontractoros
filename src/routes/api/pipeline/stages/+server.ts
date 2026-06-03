import { json } from '@sveltejs/kit';
import { and, asc, eq, isNull } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { pipelineStages } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';

export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);

	const stages = await db
		.select({
			id: pipelineStages.id,
			name: pipelineStages.name,
			color: pipelineStages.color,
			position: pipelineStages.position,
			is_default: pipelineStages.is_default,
			is_won: pipelineStages.is_won,
			is_lost: pipelineStages.is_lost,
			stale_after_days: pipelineStages.stale_after_days,
			probability: pipelineStages.probability
		})
		.from(pipelineStages)
		.where(and(eq(pipelineStages.org_id, auth.orgId), isNull(pipelineStages.deleted_at)))
		.orderBy(asc(pipelineStages.position));

	return json({ stages });
};
