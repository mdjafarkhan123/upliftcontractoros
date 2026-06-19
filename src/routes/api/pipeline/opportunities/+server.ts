import { json, error } from '@sveltejs/kit';
import { and, asc, desc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import {
	contacts,
	opportunities,
	orgMembers,
	outboxEvents,
	pipelineStages,
	quotes,
	quoteViews
} from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { createOpportunitySchema } from '$lib/server/pipeline/schemas';
import { pipelineScopeFor } from '$lib/server/pipeline/permissions';
import type { OpportunityQuoteSummary } from '$lib/types/pipeline';

export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);

	const scope = pipelineScopeFor(auth.member);
	if (scope === 'none') error(403, 'Forbidden');

	const conditions = [eq(opportunities.org_id, auth.orgId), isNull(opportunities.deleted_at)];
	if (scope === 'mine') conditions.push(eq(opportunities.assigned_to, auth.member.id));

	const contactIdParam = event.url.searchParams.get('contact_id');
	if (contactIdParam) conditions.push(eq(opportunities.contact_id, contactIdParam));

	// Pure-status model: the board shows only open deals. Default to open-only;
	// `status=all` returns the full history (e.g. a contact's closed deals).
	// Legacy `open=true` is still honoured as an alias for the default.
	const statusParam = event.url.searchParams.get('status');
	if (statusParam !== 'all') {
		conditions.push(eq(opportunities.status, 'open'));
	}

	const rows = await db
		.select({
			id: opportunities.id,
			title: opportunities.title,
			value: opportunities.value,
			stage_id: opportunities.stage_id,
			status: opportunities.status,
			contact_id: opportunities.contact_id,
			contact_name: contacts.full_name,
			assigned_to: opportunities.assigned_to,
			assignee_name: orgMembers.full_name,
			lost_reason: opportunities.lost_reason,
			lost_reason_note: opportunities.lost_reason_note,
			closed_at: opportunities.closed_at,
			created_at: opportunities.created_at,
			stage_entered_at: opportunities.stage_entered_at,
			expected_close_date: opportunities.expected_close_date,
			next_follow_up_at: opportunities.next_follow_up_at,
			last_contacted_at: contacts.last_contacted_at
		})
		.from(opportunities)
		.innerJoin(contacts, eq(contacts.id, opportunities.contact_id))
		.leftJoin(orgMembers, eq(orgMembers.id, opportunities.assigned_to))
		.where(and(...conditions))
		.orderBy(asc(opportunities.stage_entered_at));

	// Per-deal quote summary for the card's quote block: the most recent NON-DRAFT
	// quote linked to each deal, plus its view activity. One batched query keyed on
	// the open-deal ids (DISTINCT ON picks the latest-sent quote per opportunity).
	const oppIds = rows.map((r) => r.id);
	const quoteByOpp = new Map<string, OpportunityQuoteSummary>();
	if (oppIds.length > 0) {
		const quoteRows = await db
			.selectDistinctOn([quotes.opportunity_id], {
				opportunity_id: quotes.opportunity_id,
				status: quotes.status,
				current_version: quotes.current_version,
				sent_at: quotes.sent_at,
				view_count: sql<number>`(select count(*)::int from ${quoteViews} where ${quoteViews.quote_id} = ${quotes.id})`,
				last_viewed_at: sql<string | null>`(select max(${quoteViews.viewed_at}) from ${quoteViews} where ${quoteViews.quote_id} = ${quotes.id})`
			})
			.from(quotes)
			.where(
				and(
					eq(quotes.org_id, auth.orgId),
					inArray(quotes.opportunity_id, oppIds),
					isNull(quotes.deleted_at),
					ne(quotes.status, 'draft')
				)
			)
			.orderBy(asc(quotes.opportunity_id), desc(quotes.sent_at), desc(quotes.created_at));

		for (const q of quoteRows) {
			if (!q.opportunity_id) continue;
			quoteByOpp.set(q.opportunity_id, {
				status: q.status as OpportunityQuoteSummary['status'],
				current_version: q.current_version,
				sent_at: q.sent_at ? new Date(q.sent_at as unknown as string).toISOString() : null,
				view_count: q.view_count ?? 0,
				last_viewed_at: q.last_viewed_at
					? new Date(q.last_viewed_at as unknown as string).toISOString()
					: null
			});
		}
	}

	const opportunitiesOut = rows.map((r) => ({ ...r, quote: quoteByOpp.get(r.id) ?? null }));

	// Won-this-month headline value. Computed server-side (org timezone, status
	// model) and scope-aware so it survives the board only loading open deals.
	const tz = auth.org.timezone || 'America/Chicago';
	const monthStart = sql`(date_trunc('month', (now() AT TIME ZONE ${tz}))) AT TIME ZONE ${tz}`;
	const wonScope =
		scope === 'mine' ? sql`and assigned_to = ${auth.member.id}` : sql``;
	const [wonRow] = await db.execute<{ won_mtd: string }>(sql`
		select coalesce(sum(value), 0)::text as won_mtd
		from opportunities
		where org_id = ${auth.orgId}
			and deleted_at is null
			and status = 'won'
			and closed_at is not null
			and closed_at >= ${monthStart}
			${wonScope}
	`);

	return json({ opportunities: opportunitiesOut, scope, won_mtd: wonRow?.won_mtd ?? '0' });
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

	// Resolve stage: provided or default. Carry default_follow_up_days for auto-scheduling.
	let stageId = input.stage_id;
	let stageDefaultFollowUpDays: number | null = null;
	if (!stageId) {
		const [defaultStage] = await db
			.select({ id: pipelineStages.id, default_follow_up_days: pipelineStages.default_follow_up_days })
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
		stageDefaultFollowUpDays = defaultStage.default_follow_up_days;
	} else {
		const [stage] = await db
			.select({ id: pipelineStages.id, default_follow_up_days: pipelineStages.default_follow_up_days })
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
		stageDefaultFollowUpDays = stage.default_follow_up_days;
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

	const autoFollowUpAt =
		stageDefaultFollowUpDays !== null
			? new Date(Date.now() + stageDefaultFollowUpDays * 86_400_000)
			: null;

	const result = await db.transaction(async (tx) => {
		const [inserted] = await tx
			.insert(opportunities)
			.values({
				org_id: auth.orgId,
				contact_id: input.contact_id,
				stage_id: stageId!,
				title: input.title,
				value: input.value ?? null,
				assigned_to: input.assigned_to ?? null,
				expected_close_date: input.expected_close_date ?? null,
				next_follow_up_at: autoFollowUpAt
			})
			.returning();

		await tx.insert(outboxEvents).values({
			org_id: auth.orgId,
			event_type: 'opportunity.created',
			resource_type: 'opportunity',
			resource_id: inserted.id,
			payload: {
				event_version: 1,
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
