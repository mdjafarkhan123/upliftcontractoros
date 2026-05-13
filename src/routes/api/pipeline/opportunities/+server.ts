import { json, error } from '@sveltejs/kit';
import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import {
	contacts,
	opportunities,
	orgMembers,
	outboxEvents,
	pipelineStages
} from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { createOpportunitySchema } from '$lib/server/pipeline/schemas';

export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!auth.member.can_view_full_pipeline) error(403, 'Forbidden');

	const rows = await db
		.select({
			id: opportunities.id,
			title: opportunities.title,
			value: opportunities.value,
			stage_id: opportunities.stage_id,
			contact_id: opportunities.contact_id,
			contact_name: contacts.full_name,
			assigned_to: opportunities.assigned_to,
			assignee_name: orgMembers.full_name,
			lost_reason: opportunities.lost_reason,
			closed_at: opportunities.closed_at,
			created_at: opportunities.created_at
		})
		.from(opportunities)
		.innerJoin(contacts, eq(contacts.id, opportunities.contact_id))
		.leftJoin(orgMembers, eq(orgMembers.id, opportunities.assigned_to))
		.where(and(eq(opportunities.org_id, auth.orgId), isNull(opportunities.deleted_at)))
		.orderBy(desc(opportunities.created_at));

	return json({ opportunities: rows });
};

export const POST: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!auth.member.can_create_opportunities) error(403, 'Forbidden');

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		error(400, 'Invalid JSON body');
	}

	const parsed = createOpportunitySchema.safeParse(body);
	if (!parsed.success) {
		return json(
			{ error: parsed.error.issues[0]?.message ?? 'Invalid input', code: 'VALIDATION_ERROR' },
			{ status: 422 }
		);
	}

	const input = parsed.data;

	// Verify contact belongs to org and is not soft-deleted
	const [contact] = await db
		.select({ id: contacts.id })
		.from(contacts)
		.where(
			and(
				eq(contacts.id, input.contact_id),
				eq(contacts.org_id, auth.orgId),
				isNull(contacts.deleted_at)
			)
		)
		.limit(1);
	if (!contact) {
		return json({ error: 'Contact not found.', code: 'CONTACT_NOT_FOUND' }, { status: 422 });
	}

	// Resolve stage: provided or default
	let stageId = input.stage_id;
	if (!stageId) {
		const [defaultStage] = await db
			.select({ id: pipelineStages.id })
			.from(pipelineStages)
			.where(
				and(
					eq(pipelineStages.org_id, auth.orgId),
					eq(pipelineStages.is_default, true),
					isNull(pipelineStages.deleted_at)
				)
			)
			.orderBy(asc(pipelineStages.position))
			.limit(1);
		if (!defaultStage) {
			return json(
				{ error: 'No default pipeline stage configured.', code: 'NO_DEFAULT_STAGE' },
				{ status: 500 }
			);
		}
		stageId = defaultStage.id;
	} else {
		const [stage] = await db
			.select({ id: pipelineStages.id })
			.from(pipelineStages)
			.where(
				and(
					eq(pipelineStages.id, stageId),
					eq(pipelineStages.org_id, auth.orgId),
					isNull(pipelineStages.deleted_at)
				)
			)
			.limit(1);
		if (!stage) {
			return json({ error: 'Stage not found.', code: 'STAGE_NOT_FOUND' }, { status: 422 });
		}
	}

	if (input.assigned_to) {
		const [assignee] = await db
			.select({ id: orgMembers.id })
			.from(orgMembers)
			.where(
				and(
					eq(orgMembers.id, input.assigned_to),
					eq(orgMembers.org_id, auth.orgId),
					eq(orgMembers.is_active, true),
					isNull(orgMembers.deleted_at)
				)
			)
			.limit(1);
		if (!assignee) {
			return json(
				{ error: 'Assignee is not an active member.', code: 'INVALID_ASSIGNEE' },
				{ status: 422 }
			);
		}
	}

	const result = await db.transaction(async (tx) => {
		const [inserted] = await tx
			.insert(opportunities)
			.values({
				org_id: auth.orgId,
				contact_id: input.contact_id,
				stage_id: stageId!,
				title: input.title,
				value: input.value ?? null,
				assigned_to: input.assigned_to ?? null
			})
			.returning();

		await tx.insert(outboxEvents).values({
			org_id: auth.orgId,
			event_type: 'opportunity.created',
			resource_type: 'opportunity',
			resource_id: inserted.id,
			payload: {
				opportunity_id: inserted.id,
				org_id: auth.orgId,
				contact_id: inserted.contact_id,
				stage_id: inserted.stage_id,
				title: inserted.title,
				value: inserted.value,
				assigned_to: inserted.assigned_to
			},
			idempotency_key: `opportunity.created:${inserted.id}`
		});

		return inserted;
	});

	return json({ opportunity: result }, { status: 201 });
};
