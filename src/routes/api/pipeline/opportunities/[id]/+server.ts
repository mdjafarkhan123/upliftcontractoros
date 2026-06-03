import { json, error } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { contacts, opportunities, orgMembers, outboxEvents } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { updateOpportunitySchema } from '$lib/server/pipeline/schemas';
import { canViewOpportunity, pipelineScopeFor } from '$lib/server/pipeline/permissions';
import { loadOpportunityQuotes } from '$lib/server/pipeline/opportunityQuotes';
import { loadOpportunityActivity } from '$lib/server/pipeline/activity';

export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (pipelineScopeFor(auth.member) === 'none') error(403, 'Forbidden');

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
			created_at: opportunities.created_at,
			stage_entered_at: opportunities.stage_entered_at,
			expected_close_date: opportunities.expected_close_date
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
	if (!canViewOpportunity(auth.member, row)) error(404, 'Opportunity not found');

	// Inline quotes + latest 5 activity events — saves a second network round trip
	// on mobile. The dedicated /activity endpoint exists for paginated "View all".
	const includeRevenue = auth.member.can_view_revenue;
	const [quotes, activity] = await Promise.all([
		includeRevenue ? loadOpportunityQuotes(auth.orgId, row.id, 10) : Promise.resolve([]),
		loadOpportunityActivity(auth.orgId, row.id, 5)
	]);

	return json({ opportunity: { ...row, quotes, activity } });
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
		.select({
			id: opportunities.id,
			contact_id: opportunities.contact_id,
			title: opportunities.title,
			assigned_to: opportunities.assigned_to
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
	if (!existing) error(404, 'Opportunity not found');
	if (!canViewOpportunity(auth.member, existing)) error(404, 'Opportunity not found');

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
	if (input.expected_close_date !== undefined)
		updates.expected_close_date = input.expected_close_date;

	const assigneeChanged =
		input.assigned_to !== undefined &&
		(input.assigned_to ?? null) !== (existing.assigned_to ?? null);

	const result = await db.transaction(async (tx) => {
		const [updated] = await tx
			.update(opportunities)
			.set(updates)
			.where(eq(opportunities.id, id))
			.returning();

		if (assigneeChanged) {
			await tx.insert(outboxEvents).values({
				org_id: auth.orgId,
				event_type: 'opportunity.assignee_changed',
				resource_type: 'opportunity',
				resource_id: updated.id,
				payload: {
					event_version: 1,
					opportunity_id: updated.id,
					org_id: auth.orgId,
					contact_id: updated.contact_id,
					title: updated.title,
					previous_assigned_to: existing.assigned_to ?? null,
					new_assigned_to: updated.assigned_to ?? null,
					changed_by_member_id: auth.member.id
				},
				// One notification per (opportunity, new assignee) tuple. Reassigning
				// to the same member again is a no-op; reassigning to someone new fires
				// a fresh notification.
				idempotency_key: `opportunity.assignee_changed:${updated.id}:${updated.assigned_to ?? 'null'}`
			});
		}

		return updated;
	});

	return json({ opportunity: result });
};
