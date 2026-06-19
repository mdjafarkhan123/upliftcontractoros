import { json, error } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { opportunities, outboxEvents, pipelineStages } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { moveStageSchema } from '$lib/server/pipeline/schemas';
import { canViewOpportunity } from '$lib/server/pipeline/permissions';

/**
 * Move an OPEN deal between board columns. Won/Lost are no longer stages —
 * those transitions live in ./status. This endpoint only reorders an open
 * deal across open stages and emits opportunity.stage_changed.
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

	const parsed = moveStageSchema.safeParse(body);
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

	const { stage_id, from_stage_id, move_request_id } = parsed.data;

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

	// Closed deals are off the board and cannot be re-staged here.
	if (opp.status !== 'open') {
		return json({ error: 'This opportunity is already closed.' }, { status: 409 });
	}

	// Optimistic concurrency: client must know the true current stage.
	if (opp.stage_id !== from_stage_id) {
		return json({ error: 'This opportunity has already moved.' }, { status: 409 });
	}

	const [stage] = await db
		.select({ id: pipelineStages.id, name: pipelineStages.name, default_follow_up_days: pipelineStages.default_follow_up_days })
		.from(pipelineStages)
		.where(
			and(
				eq(pipelineStages.id, stage_id),
				eq(pipelineStages.org_id, auth.orgId),
				isNull(pipelineStages.deleted_at)
			)
		)
		.limit(1);
	if (!stage) {
		return json({ error: 'Stage not found.', field_errors: { stage_id: 'Stage not found.' } }, {
			status: 422
		});
	}

	if (opp.stage_id === stage_id) {
		return json({ data: { opportunity: opp } });
	}

	const [fromStage] = await db
		.select({ name: pipelineStages.name })
		.from(pipelineStages)
		.where(eq(pipelineStages.id, opp.stage_id))
		.limit(1);
	const fromStageName = fromStage?.name ?? null;

	// Auto-set follow-up from stage default, but only if the deal has none scheduled.
	// Manual follow-ups always win (null-guard prevents clobber).
	const autoFollowUpAt =
		stage.default_follow_up_days !== null && opp.next_follow_up_at === null
			? new Date(Date.now() + stage.default_follow_up_days * 86_400_000)
			: undefined;

	const result = await db.transaction(async (tx) => {
		const now = new Date();
		const stageSet: Record<string, unknown> = { stage_id, updated_at: now, stage_entered_at: now };
		if (autoFollowUpAt !== undefined) {
			stageSet.next_follow_up_at = autoFollowUpAt;
			stageSet.stale_nudged_at = null;
		}
		const [updated] = await tx
			.update(opportunities)
			.set(stageSet)
			.where(
				and(
					eq(opportunities.id, id),
					eq(opportunities.stage_id, from_stage_id),
					eq(opportunities.status, 'open')
				)
			)
			.returning();
		if (!updated) return null;

		await tx.insert(outboxEvents).values({
			org_id: auth.orgId,
			event_type: 'opportunity.stage_changed',
			resource_type: 'opportunity',
			resource_id: updated.id,
			payload: {
				event_version: 1,
				opportunity_id: updated.id,
				org_id: auth.orgId,
				contact_id: updated.contact_id,
				assigned_to: updated.assigned_to ?? null,
				from_stage_id: opp.stage_id,
				to_stage_id: stage_id,
				from_stage_name: fromStageName,
				to_stage_name: stage.name,
				changed_by_member_id: auth.member.id
			},
			idempotency_key: `opportunity.stage_changed:${move_request_id}`
		});

		return updated;
	});

	if (!result) {
		return json({ error: 'This opportunity has already moved.' }, { status: 409 });
	}

	return json({ data: { opportunity: result } });
};
