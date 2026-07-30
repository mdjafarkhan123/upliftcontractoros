import { json, error } from '@sveltejs/kit';
import { and, desc, eq, exists, isNotNull, isNull, not } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { contacts, jobs, reviewRequests } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canSendReviewRequests } from '$lib/server/reputation/permissions';

const MAX_ROWS = 100;

export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canSendReviewRequests(auth.member)) error(403, 'Forbidden');

	// Exclude any job that already has a review_request row — even soft-deleted,
	// because UNIQUE(job_id) is hard and survives deleted_at, so offering such a
	// job would 409 on insert.
	const hasReviewRequest = exists(
		db
			.select({ one: reviewRequests.id })
			.from(reviewRequests)
			.where(eq(reviewRequests.job_id, jobs.id))
	);

	const rows = await db
		.select({
			job_id: jobs.id,
			job_title: jobs.title,
			completed_at: jobs.completed_at,
			contact_id: contacts.id,
			contact_name: contacts.full_name,
			sms_opt_out: contacts.sms_opt_out,
			receives_review_requests: contacts.receives_review_requests
		})
		.from(jobs)
		.innerJoin(contacts, eq(contacts.id, jobs.contact_id))
		.where(
			and(
				eq(jobs.org_id, auth.orgId),
				// Closed as complete (archived + completed_at), never cancelled.
				eq(jobs.status, 'archived'),
				isNotNull(jobs.completed_at),
				isNull(jobs.deleted_at),
				isNull(contacts.deleted_at),
				eq(contacts.sms_opt_out, false),
				eq(contacts.receives_review_requests, true),
				not(hasReviewRequest)
			)
		)
		.orderBy(desc(jobs.completed_at))
		.limit(MAX_ROWS);

	const items = rows.map((r) => ({
		job_id: r.job_id,
		job_title: r.job_title,
		contact_id: r.contact_id,
		contact_name: r.contact_name,
		completed_at: r.completed_at?.toISOString() ?? null
	}));

	return json({ items });
};
