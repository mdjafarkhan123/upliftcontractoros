import { json, error } from '@sveltejs/kit';
import { and, desc, eq, isNull, lt, or, type SQL } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { contacts, jobs, orgMembers } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canViewAnyJob } from '$lib/server/jobs/permissions';

const PAGE_SIZE = 30;
const VALID_STATUSES = new Set(['scheduled', 'in_progress', 'completed', 'cancelled']);

export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canViewAnyJob(auth.member)) error(403, 'Forbidden');

	const url = event.url;
	const statusFilter = url.searchParams.get('status');
	const assignedToFilter = url.searchParams.get('assigned_to');
	const contactIdFilter = url.searchParams.get('contact_id');
	const cursor = url.searchParams.get('cursor');

	const conditions: SQL[] = [eq(jobs.org_id, auth.orgId), isNull(jobs.deleted_at)];

	if (statusFilter && VALID_STATUSES.has(statusFilter)) {
		conditions.push(eq(jobs.status, statusFilter as 'scheduled'));
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

	if (cursor) {
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

	const rowsPromise = db
		.select({
			id: jobs.id,
			title: jobs.title,
			status: jobs.status,
			contact_id: jobs.contact_id,
			contact_name: contacts.full_name,
			assigned_to: jobs.assigned_to,
			assignee_name: orgMembers.full_name,
			scheduled_start: jobs.scheduled_start,
			scheduled_end: jobs.scheduled_end,
			created_at: jobs.created_at
		})
		.from(jobs)
		.innerJoin(contacts, eq(contacts.id, jobs.contact_id))
		.leftJoin(orgMembers, eq(orgMembers.id, jobs.assigned_to))
		.where(and(...conditions))
		.orderBy(desc(jobs.created_at), desc(jobs.id))
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
	const items = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
	const last = items[items.length - 1];
	const nextCursor =
		hasMore && last ? `${last.created_at.toISOString()}|${last.id}` : null;

	const filterContext =
		contactIdFilter && contactRow && contactRow[0]
			? { contact_id: contactRow[0].id, contact_name: contactRow[0].full_name }
			: null;

	return json({ items, next_cursor: nextCursor, filter_context: filterContext });
};
