import { json, error } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { opportunities } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { markStatusSchema } from '$lib/server/pipeline/schemas';
import { canViewOpportunity } from '$lib/server/pipeline/permissions';
import { markOpportunityWon, markOpportunityLost } from '$lib/server/pipeline/transitions';

/**
 * Terminal status transition for a deal — the "pure status" model.
 * Won/Lost are no longer pipeline stages; they are a status on the deal.
 * - Won runs the full Flow 2 side effects (job creation, contact → customer,
 *   notifications) via the outbox. The deal keeps its current stage_id.
 * - Lost records a reason and closes the deal.
 * Only an open deal can transition; reopening is not supported in v1.
 */
export const PATCH: RequestHandler = async (event) => {
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

	const parsed = markStatusSchema.safeParse(body);
	if (!parsed.success) {
		const issue = parsed.error.issues[0];
		const field = issue?.path[0];
		return json(
			{
				error: issue?.message ?? 'Invalid input',
				field_errors:
					typeof field === 'string' ? { [field]: issue?.message ?? 'Invalid' } : undefined
			},
			{ status: 422 }
		);
	}

	const { status, lost_reason, lost_reason_note } = parsed.data;

	const [opp] = await db
		.select()
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

	if (opp.status !== 'open') {
		return json({ error: 'This opportunity is already closed.' }, { status: 409 });
	}

	// === Won transition: full Flow 2 ===
	if (status === 'won') {
		const result = await markOpportunityWon(opp);
		if (!result) {
			return json({ error: 'This opportunity is already closed.' }, { status: 409 });
		}
		return json({ data: result });
	}

	// === Lost transition ===
	const updated = await markOpportunityLost(opp, lost_reason!, lost_reason_note ?? null);
	if (!updated) {
		return json({ error: 'This opportunity is already closed.' }, { status: 409 });
	}

	return json({ data: { opportunity: updated, job: null } });
};
