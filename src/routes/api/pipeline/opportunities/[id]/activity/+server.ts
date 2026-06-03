import { json, error } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { opportunities } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canViewOpportunity, pipelineScopeFor } from '$lib/server/pipeline/permissions';
import { loadOpportunityActivity } from '$lib/server/pipeline/activity';

export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (pipelineScopeFor(auth.member) === 'none') error(403, 'Forbidden');

	const id = event.params.id!;
	const url = new URL(event.request.url);
	const rawLimit = Number(url.searchParams.get('limit') ?? '50');
	const limit = Math.min(100, Math.max(1, Number.isFinite(rawLimit) ? rawLimit : 50));

	const [row] = await db
		.select({
			id: opportunities.id,
			contact_id: opportunities.contact_id,
			assigned_to: opportunities.assigned_to,
			title: opportunities.title
		})
		.from(opportunities)
		.where(
			and(
				eq(opportunities.id, id),
				eq(opportunities.org_id, auth.orgId),
				isNull(opportunities.deleted_at)
			)
		)
		.limit(1);
	if (!row) error(404, 'Opportunity not found');
	if (!canViewOpportunity(auth.member, row)) error(404, 'Opportunity not found');

	const activity = await loadOpportunityActivity(auth.orgId, id, limit);
	return json({ data: { activity } });
};
