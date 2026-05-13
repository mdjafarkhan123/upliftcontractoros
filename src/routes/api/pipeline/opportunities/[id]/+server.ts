import { json, error } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { contacts, opportunities, orgMembers, outboxEvents } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { updateOpportunitySchema } from '$lib/server/pipeline/schemas';

export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!auth.member.can_view_full_pipeline) error(403, 'Forbidden');

	const id = event.params.id!;
	const [row] = await db
		.select({
			id: opportunities.id,
			title: opportunities.title,
			value: opportunities.value,
			stage_id: opportunities.stage_id,
			contact_id: opportunities.contact_id,
			contact_name: contacts.full_name,
			contact_phone: contacts.phone,
			contact_email: contacts.email,
			assigned_to: opportunities.assigned_to,
			assignee_name: orgMembers.full_name,
			lost_reason: opportunities.lost_reason,
			closed_at: opportunities.closed_at,
			created_at: opportunities.created_at
		})
		.from(opportunities)
		.innerJoin(contacts, eq(contacts.id, opportunities.contact_id))
		.leftJoin(orgMembers, eq(orgMembers.id, opportunities.assigned_to))
		.where(
			and(
				eq(opportunities.id, id),
				eq(opportunities.org_id, auth.orgId),
				isNull(opportunities.deleted_at)
			)
		)
		.limit(1);

	if (!row) error(404, 'Opportunity not found');
	return json({ opportunity: row });
};

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

	const parsed = updateOpportunitySchema.safeParse(body);
	if (!parsed.success) {
		return json(
			{ error: parsed.error.issues[0]?.message ?? 'Invalid input', code: 'VALIDATION_ERROR' },
			{ status: 422 }
		);
	}

	const input = parsed.data;

	const [existing] = await db
		.select({ id: opportunities.id })
		.from(opportunities)
		.where(
			and(
				eq(opportunities.id, id),
				eq(opportunities.org_id, auth.orgId),
				isNull(opportunities.deleted_at)
			)
		)
		.limit(1);
	if (!existing) error(404, 'Opportunity not found');

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

	const updates: Record<string, unknown> = { updated_at: new Date() };
	if (input.title !== undefined) updates.title = input.title;
	if (input.value !== undefined) updates.value = input.value;
	if (input.assigned_to !== undefined) updates.assigned_to = input.assigned_to;

	const result = await db.transaction(async (tx) => {
		const [updated] = await tx
			.update(opportunities)
			.set(updates)
			.where(eq(opportunities.id, id))
			.returning();

		await tx.insert(outboxEvents).values({
			org_id: auth.orgId,
			event_type: 'opportunity.updated',
			resource_type: 'opportunity',
			resource_id: updated.id,
			payload: {
				opportunity_id: updated.id,
				org_id: auth.orgId,
				changes: input
			},
			idempotency_key: `opportunity.updated:${updated.id}:${Date.now()}`
		});

		return updated;
	});

	return json({ opportunity: result });
};
