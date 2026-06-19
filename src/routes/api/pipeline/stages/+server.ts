import { json, error } from '@sveltejs/kit';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { pipelineStages } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { createStageSchema } from '$lib/server/pipeline/schemas';

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
			description: pipelineStages.description,
			stale_after_days: pipelineStages.stale_after_days,
			probability: pipelineStages.probability,
			default_follow_up_days: pipelineStages.default_follow_up_days
		})
		.from(pipelineStages)
		.where(and(eq(pipelineStages.org_id, auth.orgId), isNull(pipelineStages.deleted_at)))
		.orderBy(asc(pipelineStages.position));

	return json({ stages });
};

export const POST: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!auth.member.can_manage_pipeline) error(403, 'Forbidden');

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		error(400, 'Invalid JSON body');
	}

	const parsed = createStageSchema.safeParse(body);
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

	const input = parsed.data;

	// Case-insensitive name uniqueness among the org's non-deleted stages.
	const [dupe] = await db
		.select({ id: pipelineStages.id })
		.from(pipelineStages)
		.where(
			and(
				eq(pipelineStages.org_id, auth.orgId),
				isNull(pipelineStages.deleted_at),
				sql`lower(${pipelineStages.name}) = lower(${input.name})`
			)
		)
		.limit(1);
	if (dupe) {
		return json(
			{
				error: `A stage named "${input.name}" already exists.`,
				field_errors: { name: `A stage named "${input.name}" already exists.` }
			},
			{ status: 422 }
		);
	}

	const [maxRow] = await db
		.select({ max: sql<number>`coalesce(max(${pipelineStages.position}), 0)` })
		.from(pipelineStages)
		.where(and(eq(pipelineStages.org_id, auth.orgId), isNull(pipelineStages.deleted_at)));

	const [stage] = await db
		.insert(pipelineStages)
		.values({
			org_id: auth.orgId,
			name: input.name,
			color: input.color,
			description: input.description ?? null,
			probability: input.probability ?? null,
			stale_after_days: input.stale_after_days ?? null,
			default_follow_up_days: input.default_follow_up_days ?? null,
			position: (maxRow?.max ?? 0) + 1,
			is_default: false,
			is_won: false,
			is_lost: false
		})
		.returning();

	return json({ data: stage }, { status: 201 });
};
