import { json, error } from '@sveltejs/kit';
import { and, asc, eq, isNull, ne, sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { opportunities, pipelineStages } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { updateStageSchema } from '$lib/server/pipeline/schemas';

// Load a manageable (open, non-deleted) stage owned by the org.
async function loadStage(orgId: string, id: string) {
	const [stage] = await db
		.select()
		.from(pipelineStages)
		.where(
			and(
				eq(pipelineStages.id, id),
				eq(pipelineStages.org_id, orgId),
				isNull(pipelineStages.deleted_at)
			)
		)
		.limit(1);
	return stage ?? null;
}

export const PATCH: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!auth.member.can_manage_pipeline) error(403, 'Forbidden');

	const id = event.params.id!;

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		error(400, 'Invalid JSON body');
	}

	const parsed = updateStageSchema.safeParse(body);
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

	const stage = await loadStage(auth.orgId, id);
	if (!stage) error(404, 'Stage not found');

	// Case-insensitive name uniqueness (excluding this stage) when renaming.
	if (input.name !== undefined && input.name.toLowerCase() !== stage.name.toLowerCase()) {
		const [dupe] = await db
			.select({ id: pipelineStages.id })
			.from(pipelineStages)
			.where(
				and(
					eq(pipelineStages.org_id, auth.orgId),
					isNull(pipelineStages.deleted_at),
					ne(pipelineStages.id, id),
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
	}

	const now = new Date();
	const patch: Record<string, unknown> = { updated_at: now };
	if (input.name !== undefined) patch.name = input.name;
	if (input.color !== undefined) patch.color = input.color;
	if (input.description !== undefined) patch.description = input.description;
	if (input.probability !== undefined) patch.probability = input.probability;
	if (input.stale_after_days !== undefined) patch.stale_after_days = input.stale_after_days;
	if (input.default_follow_up_days !== undefined)
		patch.default_follow_up_days = input.default_follow_up_days;

	// Set-default is a transactional swap: unset every other default first so the
	// exactly-one-default invariant always holds.
	if (input.is_default === true && !stage.is_default) {
		const updated = await db.transaction(async (tx) => {
			await tx
				.update(pipelineStages)
				.set({ is_default: false, updated_at: now })
				.where(
					and(
						eq(pipelineStages.org_id, auth.orgId),
						eq(pipelineStages.is_default, true),
						isNull(pipelineStages.deleted_at)
					)
				);
			const [row] = await tx
				.update(pipelineStages)
				.set({ ...patch, is_default: true })
				.where(eq(pipelineStages.id, id))
				.returning();
			return row;
		});
		return json({ data: updated });
	}

	const [updated] = await db
		.update(pipelineStages)
		.set(patch)
		.where(eq(pipelineStages.id, id))
		.returning();

	return json({ data: updated });
};

export const DELETE: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!auth.member.can_manage_pipeline) error(403, 'Forbidden');

	const id = event.params.id!;

	const stage = await loadStage(auth.orgId, id);
	if (!stage) error(404, 'Stage not found');

	// Must always keep at least one stage on the board.
	const [{ count: stageCount }] = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(pipelineStages)
		.where(and(eq(pipelineStages.org_id, auth.orgId), isNull(pipelineStages.deleted_at)));
	if (stageCount <= 1) {
		return json({ error: 'You must keep at least one pipeline stage.' }, { status: 422 });
	}

	// Open deals currently sitting in this stage must be relocated.
	const [{ count: openDeals }] = await db
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

	const moveTo = event.url.searchParams.get('move_to');

	if (openDeals > 0 && !moveTo) {
		return json(
			{ error: 'This stage has open deals. Choose a stage to move them to.' },
			{ status: 422 }
		);
	}

	// Validate the move destination when one was supplied.
	if (moveTo) {
		if (moveTo === id) {
			return json(
				{
					error: 'Choose a different stage to move deals to.',
					field_errors: { move_to: 'Invalid destination' }
				},
				{ status: 422 }
			);
		}
		const dest = await loadStage(auth.orgId, moveTo);
		if (!dest) {
			return json(
				{
					error: 'Destination stage not found.',
					field_errors: { move_to: 'Destination stage not found' }
				},
				{ status: 422 }
			);
		}
	}

	// Pick the new default if we're removing the current default: prefer the
	// move destination, else the lowest-position remaining stage.
	let newDefaultId: string | null = null;
	if (stage.is_default) {
		if (moveTo) {
			newDefaultId = moveTo;
		} else {
			const [next] = await db
				.select({ id: pipelineStages.id })
				.from(pipelineStages)
				.where(
					and(
						eq(pipelineStages.org_id, auth.orgId),
						ne(pipelineStages.id, id),
						isNull(pipelineStages.deleted_at)
					)
				)
				.orderBy(asc(pipelineStages.position))
				.limit(1);
			newDefaultId = next?.id ?? null;
		}
	}

	const now = new Date();
	const moved = await db.transaction(async (tx) => {
		let movedCount = 0;
		if (moveTo && openDeals > 0) {
			const rows = await tx
				.update(opportunities)
				.set({ stage_id: moveTo, stage_entered_at: now, updated_at: now })
				.where(
					and(
						eq(opportunities.org_id, auth.orgId),
						eq(opportunities.stage_id, id),
						eq(opportunities.status, 'open'),
						isNull(opportunities.deleted_at)
					)
				)
				.returning({ id: opportunities.id });
			movedCount = rows.length;
		}

		if (newDefaultId) {
			await tx
				.update(pipelineStages)
				.set({ is_default: true, updated_at: now })
				.where(eq(pipelineStages.id, newDefaultId));
		}

		await tx
			.update(pipelineStages)
			.set({ deleted_at: now, is_default: false, updated_at: now })
			.where(eq(pipelineStages.id, id));

		return movedCount;
	});

	return json({ data: { moved, new_default_stage_id: newDefaultId } });
};
