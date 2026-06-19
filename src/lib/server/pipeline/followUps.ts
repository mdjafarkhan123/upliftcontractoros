import { and, desc, eq } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { opportunityFollowUps, orgMembers } from '$lib/server/db/schema';
import type { OpportunityFollowUp, FollowUpOutcome } from '$lib/types/pipeline';

export async function loadOpportunityFollowUps(
	orgId: string,
	opportunityId: string,
	limit: number
): Promise<OpportunityFollowUp[]> {
	const rows = await db
		.select({
			id: opportunityFollowUps.id,
			logged_by: opportunityFollowUps.logged_by,
			logged_by_name: orgMembers.full_name,
			outcome: opportunityFollowUps.outcome,
			note: opportunityFollowUps.note,
			occurred_at: opportunityFollowUps.occurred_at
		})
		.from(opportunityFollowUps)
		.innerJoin(orgMembers, eq(orgMembers.id, opportunityFollowUps.logged_by))
		.where(
			and(
				eq(opportunityFollowUps.org_id, orgId),
				eq(opportunityFollowUps.opportunity_id, opportunityId)
			)
		)
		.orderBy(desc(opportunityFollowUps.occurred_at))
		.limit(limit);

	return rows.map((r) => ({
		...r,
		outcome: r.outcome as FollowUpOutcome,
		occurred_at: new Date(r.occurred_at).toISOString()
	}));
}
