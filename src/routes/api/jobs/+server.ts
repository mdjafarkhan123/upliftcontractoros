import { json, error } from '@sveltejs/kit';
import { and, desc, eq, gt, gte, inArray, isNull, lt, lte, or, sql, type SQL } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import {
	contacts,
	contactAddresses,
	jobs,
	jobLineItems,
	orgMembers,
	outboxEvents,
	reviewRequests
} from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canViewAnyJob } from '$lib/server/jobs/permissions';
import { createJobSchema } from '$lib/server/jobs/schemas';
import { computeLineTotal, recalcJobTotals } from '$lib/server/jobs/recalc';
import { textMatch, textRank } from '$lib/server/search/textSearch';

const PAGE_SIZE = 30;
const VALID_STATUSES = new Set(['scheduled', 'in_progress', 'completed', 'cancelled']);
const VALID_SCOPES = new Set(['today', 'awaiting_review', 'unscheduled']);

function startOfTodayUtc(): Date {
	const d = new Date();
	d.setHours(0, 0, 0, 0);
	return d;
}

function endOfTodayUtc(): Date {
	const d = new Date();
	d.setHours(23, 59, 59, 999);
	return d;
}

export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canViewAnyJob(auth.member)) error(403, 'Forbidden');

	const url = event.url;
	const statusFilter = url.searchParams.get('status');
	const scopeFilter = url.searchParams.get('scope');
	const assignedToFilter = url.searchParams.get('assigned_to');
	const contactIdFilter = url.searchParams.get('contact_id');
	const searchRaw = (url.searchParams.get('q') ?? '').trim();
	const cursor = url.searchParams.get('cursor');

	const conditions: SQL[] = [eq(jobs.org_id, auth.orgId), isNull(jobs.deleted_at)];

	if (statusFilter && VALID_STATUSES.has(statusFilter)) {
		conditions.push(eq(jobs.status, statusFilter as 'scheduled'));
	}

	if (scopeFilter && VALID_SCOPES.has(scopeFilter)) {
		if (scopeFilter === 'today') {
			conditions.push(
				inArray(jobs.status, ['scheduled', 'in_progress']),
				gte(jobs.scheduled_start, startOfTodayUtc()),
				lte(jobs.scheduled_start, endOfTodayUtc())
			);
		} else if (scopeFilter === 'awaiting_review') {
			conditions.push(eq(jobs.status, 'completed'));
			conditions.push(
				sql`NOT EXISTS (
					SELECT 1 FROM ${reviewRequests}
					WHERE ${reviewRequests.job_id} = ${jobs.id}
					  AND ${reviewRequests.status} IN ('likely_reviewed','completed_internal')
				)`
			);
		} else if (scopeFilter === 'unscheduled') {
			conditions.push(eq(jobs.status, 'scheduled'), isNull(jobs.scheduled_start));
		}
	}

	if (assignedToFilter) {
		conditions.push(eq(jobs.assigned_to, assignedToFilter));
	}

	if (contactIdFilter) {
		conditions.push(eq(jobs.contact_id, contactIdFilter));
	}

	if (!auth.member.can_view_full_pipeline) {
		conditions.push(eq(jobs.assigned_to, auth.member.id));
	}

	// Fuzzy search across the job title + the linked contact's name/company.
	// Same shared helper + relevance buckets as the Contacts list; the trigram
	// indexes (jobs.title from 0080, contacts.* from 0079) keep it index-fast.
	const isSearching = searchRaw.length > 0;
	const searchFields = [jobs.title, contacts.full_name, contacts.company_name];
	let relevance: SQL<number> | null = null;
	if (isSearching) {
		relevance = textRank(searchRaw, searchFields);
		conditions.push(textMatch(searchRaw, searchFields));
	}

	if (cursor) {
		if (isSearching && relevance) {
			// Searching orders by relevance first, so the cursor carries the rank:
			// "<rank>|<iso_created_at>|<id>".
			const [rankStr, createdAt, id] = cursor.split('|');
			const rank = Number(rankStr);
			if (Number.isFinite(rank) && createdAt && id) {
				conditions.push(
					or(
						gt(relevance, rank),
						and(eq(relevance, rank), lt(jobs.created_at, new Date(createdAt))),
						and(eq(relevance, rank), eq(jobs.created_at, new Date(createdAt)), lt(jobs.id, id))
					) as SQL
				);
			}
		} else {
			const [createdAt, id] = cursor.split('|');
			if (createdAt && id) {
				conditions.push(
					or(
						lt(jobs.created_at, new Date(createdAt)),
						and(eq(jobs.created_at, new Date(createdAt)), lt(jobs.id, id))
					) as SQL
				);
			}
		}
	}

	const rowsPromise = db
		.select({
			id: jobs.id,
			title: jobs.title,
			status: jobs.status,
			source: jobs.source,
			contact_id: jobs.contact_id,
			contact_name: contacts.full_name,
			assigned_to: jobs.assigned_to,
			assignee_name: orgMembers.full_name,
			scheduled_start: jobs.scheduled_start,
			scheduled_end: jobs.scheduled_end,
			created_at: jobs.created_at,
			rank: relevance ?? sql<number>`0`
		})
		.from(jobs)
		.innerJoin(contacts, eq(contacts.id, jobs.contact_id))
		.leftJoin(orgMembers, eq(orgMembers.id, jobs.assigned_to))
		.where(and(...conditions))
		.orderBy(...(relevance ? [relevance] : []), desc(jobs.created_at), desc(jobs.id))
		.limit(PAGE_SIZE + 1);

	const filterContextPromise =
		contactIdFilter && !cursor
			? db
					.select({ id: contacts.id, full_name: contacts.full_name })
					.from(contacts)
					.where(
						and(
							eq(contacts.id, contactIdFilter),
							eq(contacts.org_id, auth.orgId),
							isNull(contacts.deleted_at)
						)
					)
					.limit(1)
			: Promise.resolve(null);

	const [rows, contactRow] = await Promise.all([rowsPromise, filterContextPromise]);

	const hasMore = rows.length > PAGE_SIZE;
	const sliced = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
	const last = sliced[sliced.length - 1];
	const items = sliced.map(({ rank: _rank, ...r }) => r);
	const nextCursor =
		hasMore && last
			? isSearching
				? `${last.rank}|${last.created_at.toISOString()}|${last.id}`
				: `${last.created_at.toISOString()}|${last.id}`
			: null;

	const filterContext =
		contactIdFilter && contactRow && contactRow[0]
			? { contact_id: contactRow[0].id, contact_name: contactRow[0].full_name }
			: null;

	return json({ items, next_cursor: nextCursor, filter_context: filterContext });
};

export const POST: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);

	if (!auth.member.can_view_full_pipeline) error(403, 'Forbidden');

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		error(400, 'Invalid JSON body');
	}

	const parsed = createJobSchema.safeParse(body);
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 422 });
	}
	const input = parsed.data;

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
		return json({ error: 'Contact not found.' }, { status: 422 });
	}

	const [primaryAddress] = await db
		.select({
			line_1: contactAddresses.address_line_1,
			line_2: contactAddresses.address_line_2,
			city: contactAddresses.city,
			state: contactAddresses.state,
			zip: contactAddresses.zip
		})
		.from(contactAddresses)
		.where(
			and(
				eq(contactAddresses.contact_id, input.contact_id),
				eq(contactAddresses.org_id, auth.orgId),
				isNull(contactAddresses.deleted_at)
			)
		)
		.orderBy(desc(contactAddresses.is_primary))
		.limit(1);

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
			return json({ error: 'Assignee is not an active member.' }, { status: 422 });
		}
	}

	const now = new Date();
	const status = input.status ?? 'scheduled';

	const discountType = input.discount_type ?? 'none';

	const created = await db.transaction(async (tx) => {
		const [row] = await tx
			.insert(jobs)
			.values({
				org_id: auth.orgId,
				opportunity_id: input.opportunity_id ?? null,
				source: 'manual',
				contact_id: input.contact_id,
				title: input.title,
				status,
				assigned_to: input.assigned_to ?? null,
				job_type: input.job_type ?? null,
				tags: input.tags ?? [],
				scheduled_start: input.scheduled_start ?? null,
				scheduled_end: input.scheduled_end ?? null,
				scope_of_work: input.scope_of_work,
				notes: input.notes,
				service_address_line_1: input.service_address_line_1 ?? primaryAddress?.line_1 ?? null,
				service_address_line_2: input.service_address_line_2 ?? primaryAddress?.line_2 ?? null,
				service_address_city: input.service_address_city ?? primaryAddress?.city ?? null,
				service_address_state: input.service_address_state ?? primaryAddress?.state ?? null,
				service_address_zip: input.service_address_zip ?? primaryAddress?.zip ?? null,
				// Pricing — recalcJobTotals computes subtotal/discount_amount/tax_amount/total
				// from the inserted line items below.
				tax_rate: input.tax_rate !== undefined ? String(input.tax_rate) : '0',
				discount_type: discountType,
				discount_value:
					discountType !== 'none' && input.discount_value != null
						? String(input.discount_value)
						: null,
				discount_amount: null,
				discount_label: discountType !== 'none' ? input.discount_label?.trim() || null : null,
				completed_at: status === 'completed' ? now : null
			})
			.returning();

		if (input.line_items && input.line_items.length > 0) {
			await tx.insert(jobLineItems).values(
				input.line_items.map((li, idx) => ({
					org_id: auth.orgId,
					job_id: row.id,
					// undefined → DB default (fresh uuid); never pass null (column is NOT NULL).
					line_key: li.line_key ?? undefined,
					description: li.description,
					details: li.details?.trim() || null,
					quantity: String(li.quantity),
					unit: li.unit?.trim() || null,
					section_label: li.section_label?.trim() || null,
					unit_price: String(li.unit_price),
					unit_cost: li.unit_cost != null ? String(li.unit_cost) : null,
					source_catalog_item_id: li.source_catalog_item_id ?? null,
					total: computeLineTotal(li.quantity, li.unit_price),
					position: li.position ?? idx
				}))
			);
			await recalcJobTotals(tx, row.id);
		}

		await tx.insert(outboxEvents).values({
			org_id: auth.orgId,
			event_type: 'job.created.manual',
			resource_type: 'job',
			resource_id: row.id,
			payload: {
				job_id: row.id,
				org_id: auth.orgId,
				contact_id: row.contact_id,
				assigned_to: row.assigned_to,
				status: row.status,
				created_at: row.created_at
			},
			idempotency_key: `job.created.manual:${row.id}`
		});

		if (status === 'completed') {
			await tx.insert(outboxEvents).values({
				org_id: auth.orgId,
				event_type: 'job.completed',
				resource_type: 'job',
				resource_id: row.id,
				payload: {
					job_id: row.id,
					org_id: auth.orgId,
					contact_id: row.contact_id,
					completed_at: row.completed_at
				},
				idempotency_key: `job.completed:${row.id}`
			});
		}

		return row;
	});

	return json({ job: created }, { status: 201 });
};
