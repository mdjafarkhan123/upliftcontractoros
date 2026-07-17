import { json, error } from '@sveltejs/kit';
import { and, asc, desc, eq, isNotNull, isNull, ne, sql, type SQL } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import {
	appointments,
	contactAddresses,
	contacts,
	outboxEvents,
	requestLineItems,
	requests
} from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canManageRequests, canViewRequests } from '$lib/server/requests/permissions';
import { createRequestSchema } from '$lib/server/requests/schemas';
import { toLineItemValues } from '$lib/server/requests/lineItems';
import { deriveRequestStatus, type RequestDerivedStatus } from '$lib/server/requests/status';
import { normalizeSearchTerm, textMatch, textRank } from '$lib/server/search/textSearch';

const MAX_ROWS = 500;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Terminal/approval statuses are cheap SQL predicates on the requests row.
// Schedule-dependent statuses (new/unscheduled/upcoming/overdue/completed)
// depend on the joined assessment, so those tabs narrow in SQL to "open"
// requests and finish the filter on the DERIVED status in JS — the single
// source of truth stays deriveRequestStatus().
const OPEN_PREFILTER_TABS = new Set([
	'new',
	'unscheduled',
	'upcoming',
	'overdue',
	'assessment_completed'
]);

// Derived-status match per tab; 'upcoming' includes 'today' (the badge still
// distinguishes them).
function tabMatches(tab: string, status: RequestDerivedStatus): boolean {
	if (tab === 'upcoming') return status === 'upcoming' || status === 'today';
	return status === tab;
}

// Rows with derived status + KPI counts. Filters: ?status= (tab), ?q= (fuzzy
// search on title/client), ?date_from=&date_to= (requested_at, inclusive).
export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canViewRequests(auth.member)) error(403, 'Forbidden');
	const timezone = auth.org.timezone || 'America/Chicago';

	const url = event.url;
	const statusFilter = url.searchParams.get('status') ?? 'all';
	const dateFrom = url.searchParams.get('date_from');
	const dateTo = url.searchParams.get('date_to');
	const search = normalizeSearchTerm(url.searchParams.get('q'));

	const conditions: SQL[] = [];
	if (statusFilter === 'converted') {
		conditions.push(isNotNull(requests.converted_at));
	} else if (statusFilter === 'archived') {
		conditions.push(isNull(requests.converted_at), isNotNull(requests.archived_at));
	} else if (statusFilter === 'needs_approval') {
		conditions.push(
			eq(requests.approval_state, 'pending'),
			isNull(requests.converted_at),
			isNull(requests.archived_at)
		);
	} else if (OPEN_PREFILTER_TABS.has(statusFilter)) {
		conditions.push(
			ne(requests.approval_state, 'pending'),
			isNull(requests.converted_at),
			isNull(requests.archived_at)
		);
	}

	if (dateFrom && ISO_DATE.test(dateFrom)) {
		conditions.push(
			sql`(${requests.requested_at} AT TIME ZONE ${timezone})::date >= ${dateFrom}::date`
		);
	}
	if (dateTo && ISO_DATE.test(dateTo)) {
		conditions.push(
			sql`(${requests.requested_at} AT TIME ZONE ${timezone})::date <= ${dateTo}::date`
		);
	}

	let relevance: SQL<number> | null = null;
	if (search) {
		const fields = [requests.title, contacts.full_name, contacts.company_name];
		relevance = textRank(search, fields);
		conditions.push(textMatch(search, fields));
	}

	// "Property" column: the contact's primary (or oldest live) address.
	const propertySql = sql<string | null>`(
		SELECT concat_ws(', ', ca.address_line_1, ca.city, ca.state)
		FROM ${contactAddresses} ca
		WHERE ca.contact_id = ${contacts.id} AND ca.deleted_at IS NULL
		ORDER BY ca.is_primary DESC, ca.created_at ASC
		LIMIT 1
	)`;

	const rows = await db
		.select({
			property: propertySql,
			id: requests.id,
			title: requests.title,
			source: requests.source,
			approval_state: requests.approval_state,
			converted_at: requests.converted_at,
			converted_to_quote_id: requests.converted_to_quote_id,
			converted_to_job_id: requests.converted_to_job_id,
			archived_at: requests.archived_at,
			requested_at: requests.requested_at,
			created_at: requests.created_at,
			contact_id: requests.contact_id,
			contact_name: contacts.full_name,
			contact_company: contacts.company_name,
			contact_phone: contacts.phone,
			contact_email: contacts.email,
			assessment_status: appointments.status,
			assessment_start: appointments.scheduled_start,
			assessment_end: appointments.scheduled_end,
			assessment_all_day: appointments.all_day
		})
		.from(requests)
		.innerJoin(contacts, eq(contacts.id, requests.contact_id))
		.leftJoin(
			appointments,
			and(eq(appointments.request_id, requests.id), isNull(appointments.deleted_at))
		)
		.where(and(eq(requests.org_id, auth.orgId), isNull(requests.deleted_at), ...conditions))
		.orderBy(
			...(relevance
				? [asc(relevance), desc(requests.created_at)]
				: [desc(requests.created_at)])
		)
		.limit(MAX_ROWS);

	let items = rows.map((r) => ({
		property: r.property,
		id: r.id,
		title: r.title,
		source: r.source,
		approval_state: r.approval_state,
		converted_to_quote_id: r.converted_to_quote_id,
		converted_to_job_id: r.converted_to_job_id,
		requested_at: r.requested_at.toISOString(),
		created_at: r.created_at.toISOString(),
		contact: {
			id: r.contact_id,
			full_name: r.contact_name,
			company_name: r.contact_company,
			phone: r.contact_phone,
			email: r.contact_email
		},
		assessment_start: r.assessment_start?.toISOString() ?? null,
		status: deriveRequestStatus(
			{
				approval_state: r.approval_state,
				converted_at: r.converted_at,
				archived_at: r.archived_at
			},
			r.assessment_status
				? {
						status: r.assessment_status,
						scheduled_start: r.assessment_start,
						scheduled_end: r.assessment_end,
						all_day: r.assessment_all_day ?? false
					}
				: null,
			{ timezone }
		)
	}));

	if (OPEN_PREFILTER_TABS.has(statusFilter)) {
		items = items.filter((i) => tabMatches(statusFilter, i.status));
	}

	return json({ data: { items } });
};

export const POST: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canManageRequests(auth.member)) error(403, 'Forbidden');

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const parsed = createRequestSchema.safeParse(body);
	if (!parsed.success) {
		const field_errors: Record<string, string> = {};
		for (const issue of parsed.error.issues) {
			const path = issue.path.join('.');
			if (path && !field_errors[path]) field_errors[path] = issue.message;
		}
		return json(
			{ error: parsed.error.issues[0]?.message ?? 'Invalid input', field_errors },
			{ status: 422 }
		);
	}
	const input = parsed.data;

	const [contactRow] = await db
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
	if (!contactRow) return json({ error: 'Contact not found' }, { status: 422 });

	const created = await db.transaction(async (tx) => {
		const [inserted] = await tx
			.insert(requests)
			.values({
				org_id: auth.orgId,
				contact_id: input.contact_id,
				title: input.title,
				service_details: input.service_details ?? null,
				lead_source_answer: input.lead_source_answer ?? null,
				notes: input.notes ?? null,
				source: 'internal',
				approval_state: 'not_required',
				...(input.requested_at ? { requested_at: input.requested_at } : {}),
				created_by: auth.member.id
			})
			.returning();

		if (input.line_items && input.line_items.length > 0) {
			await tx
				.insert(requestLineItems)
				.values(toLineItemValues(auth.orgId, inserted.id, input.line_items));
		}

		await tx.insert(outboxEvents).values({
			org_id: auth.orgId,
			event_type: 'request.created',
			resource_type: 'request',
			resource_id: inserted.id,
			payload: {
				request_id: inserted.id,
				org_id: auth.orgId,
				contact_id: inserted.contact_id,
				source: inserted.source,
				title: inserted.title
			},
			idempotency_key: `request.created:${inserted.id}`
		});

		return inserted;
	});

	return json({ data: { id: created.id } }, { status: 201 });
};
