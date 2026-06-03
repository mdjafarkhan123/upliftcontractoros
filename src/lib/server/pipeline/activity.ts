import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { activityEvents, orgMembers, quotes } from '$lib/server/db/schema';

export type OpportunityActivityKind =
	| 'stage'
	| 'assignee'
	| 'quote_sent'
	| 'quote_viewed'
	| 'quote_accepted'
	| 'quote_declined'
	| 'created'
	| 'won'
	| 'lost';

export type OpportunityActivityRow = {
	id: string;
	kind: OpportunityActivityKind;
	summary: string;
	occurred_at: string;
};

type RawRow = {
	id: string;
	event_type: string;
	resource_type: string;
	resource_id: string;
	payload: Record<string, unknown>;
	occurred_at: Date;
};

const KIND_BY_EVENT: Record<string, OpportunityActivityKind> = {
	'opportunity.created': 'created',
	'opportunity.stage_changed': 'stage',
	'opportunity.assignee_changed': 'assignee',
	'opportunity.won': 'won',
	'opportunity.lost': 'lost',
	'quote.sent': 'quote_sent',
	'quote.viewed': 'quote_viewed',
	'quote.accepted': 'quote_accepted',
	'quote.declined': 'quote_declined'
};

const OPP_EVENT_TYPES = [
	'opportunity.created',
	'opportunity.stage_changed',
	'opportunity.assignee_changed',
	'opportunity.won',
	'opportunity.lost'
];

const QUOTE_EVENT_TYPES = ['quote.sent', 'quote.viewed', 'quote.accepted', 'quote.declined'];

function asString(v: unknown): string | null {
	return typeof v === 'string' && v.length > 0 ? v : null;
}

export async function loadOpportunityActivity(
	orgId: string,
	opportunityId: string,
	limit: number
): Promise<OpportunityActivityRow[]> {
	// Pull opportunity-keyed events and any quote-keyed events whose quote belongs
	// to this opportunity, in one round trip per resource type.
	const oppRowsP = db
		.select({
			id: activityEvents.id,
			event_type: activityEvents.event_type,
			resource_type: activityEvents.resource_type,
			resource_id: activityEvents.resource_id,
			payload: activityEvents.payload,
			occurred_at: activityEvents.occurred_at
		})
		.from(activityEvents)
		.where(
			and(
				eq(activityEvents.org_id, orgId),
				eq(activityEvents.resource_type, 'opportunity'),
				eq(activityEvents.resource_id, opportunityId),
				inArray(activityEvents.event_type, OPP_EVENT_TYPES)
			)
		)
		.orderBy(desc(activityEvents.occurred_at))
		.limit(limit);

	const quoteRowsP = db
		.select({
			id: activityEvents.id,
			event_type: activityEvents.event_type,
			resource_type: activityEvents.resource_type,
			resource_id: activityEvents.resource_id,
			payload: activityEvents.payload,
			occurred_at: activityEvents.occurred_at
		})
		.from(activityEvents)
		.innerJoin(
			quotes,
			and(
				eq(quotes.id, activityEvents.resource_id),
				eq(quotes.org_id, orgId),
				eq(quotes.opportunity_id, opportunityId)
			)
		)
		.where(
			and(
				eq(activityEvents.org_id, orgId),
				eq(activityEvents.resource_type, 'quote'),
				inArray(activityEvents.event_type, QUOTE_EVENT_TYPES)
			)
		)
		.orderBy(desc(activityEvents.occurred_at))
		.limit(limit);

	const [oppRows, quoteRows] = await Promise.all([oppRowsP, quoteRowsP]);
	const all: RawRow[] = [...(oppRows as unknown as RawRow[]), ...(quoteRows as unknown as RawRow[])]
		.sort((a, b) => +new Date(b.occurred_at) - +new Date(a.occurred_at))
		.slice(0, limit);

	if (all.length === 0) return [];

	// Resolve actor names for stage/assignee changes in one shot.
	const memberIds = new Set<string>();
	for (const r of all) {
		const id = asString(r.payload?.changed_by_member_id);
		if (id) memberIds.add(id);
		const newId = asString(r.payload?.new_assigned_to);
		if (newId) memberIds.add(newId);
		const prevId = asString(r.payload?.previous_assigned_to);
		if (prevId) memberIds.add(prevId);
	}

	const memberMap = new Map<string, string>();
	if (memberIds.size > 0) {
		const rows = await db
			.select({ id: orgMembers.id, full_name: orgMembers.full_name })
			.from(orgMembers)
			.where(inArray(orgMembers.id, Array.from(memberIds)));
		for (const m of rows) memberMap.set(m.id, m.full_name);
	}

	const name = (id: string | null) => (id ? (memberMap.get(id) ?? 'A teammate') : null);

	const out: OpportunityActivityRow[] = [];
	for (const r of all) {
		const kind = KIND_BY_EVENT[r.event_type];
		if (!kind) continue;
		const occurred_at = new Date(r.occurred_at).toISOString();
		let summary = '';
		switch (kind) {
			case 'stage': {
				const from = asString(r.payload?.from_stage_name) ?? 'previous stage';
				const to = asString(r.payload?.to_stage_name) ?? 'a new stage';
				const actor = name(asString(r.payload?.changed_by_member_id));
				summary = actor ? `${actor} moved ${from} → ${to}` : `Moved ${from} → ${to}`;
				break;
			}
			case 'assignee': {
				const actor = name(asString(r.payload?.changed_by_member_id));
				const newName = name(asString(r.payload?.new_assigned_to));
				const prevName = name(asString(r.payload?.previous_assigned_to));
				const target = newName ?? 'unassigned';
				if (actor && prevName && newName)
					summary = `${actor} reassigned from ${prevName} to ${newName}`;
				else if (actor && newName) summary = `${actor} assigned to ${newName}`;
				else if (actor && !newName) summary = `${actor} unassigned`;
				else summary = `Assigned to ${target}`;
				break;
			}
			case 'created':
				summary = 'Opportunity created';
				break;
			case 'won':
				summary = 'Marked won';
				break;
			case 'lost': {
				const reason = asString(r.payload?.lost_reason);
				summary = reason ? `Marked lost — ${reason}` : 'Marked lost';
				break;
			}
			case 'quote_sent': {
				const num = asString(r.payload?.quote_number_display);
				summary = num ? `Quote ${num} sent` : 'Quote sent';
				break;
			}
			case 'quote_viewed': {
				summary = 'Customer viewed the quote';
				break;
			}
			case 'quote_accepted':
				summary = 'Customer accepted the quote';
				break;
			case 'quote_declined':
				summary = 'Customer declined the quote';
				break;
		}
		out.push({ id: r.id, kind, summary, occurred_at });
	}
	return out;
}
