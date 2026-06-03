import { json, error } from '@sveltejs/kit';
import { and, desc, eq, isNull } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { contacts, jobs, reviewRequests } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canViewReviews } from '$lib/server/reputation/permissions';

const MAX_ROWS = 200;

export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canViewReviews(auth.member)) error(403, 'Forbidden');

	const rows = await db
		.select({
			id: reviewRequests.id,
			job_id: reviewRequests.job_id,
			job_title: jobs.title,
			job_status: jobs.status,
			contact_id: reviewRequests.contact_id,
			contact_name: contacts.full_name,
			status: reviewRequests.status,
			submitted_rating: reviewRequests.submitted_rating,
			sent_by_automation: reviewRequests.sent_by_automation,
			sent_at: reviewRequests.sent_at,
			engaged_at: reviewRequests.engaged_at,
			redirected_to_google_at: reviewRequests.redirected_to_google_at,
			completed_at: reviewRequests.completed_at,
			expired_at: reviewRequests.expired_at,
			attributed_at: reviewRequests.attributed_at,
			confidence_score: reviewRequests.confidence_score,
			nudge_count: reviewRequests.nudge_count,
			token_expires_at: reviewRequests.token_expires_at,
			created_at: reviewRequests.created_at
		})
		.from(reviewRequests)
		.innerJoin(contacts, eq(contacts.id, reviewRequests.contact_id))
		.innerJoin(jobs, eq(jobs.id, reviewRequests.job_id))
		.where(and(eq(reviewRequests.org_id, auth.orgId), isNull(reviewRequests.deleted_at)))
		.orderBy(desc(reviewRequests.created_at))
		.limit(MAX_ROWS);

	// Lazy expiry: surface active rows whose token has passed as expired in the
	// response. The DB row may still be in 'sent' / 'engaged' until the
	// review.expire worker flips it — UI uses is_expired for the chip.
	const now = Date.now();
	const items = rows.map((r) => {
		const isActive = r.status === 'sent' || r.status === 'engaged';
		const expired = isActive && r.token_expires_at !== null && r.token_expires_at.getTime() < now;
		return {
			...r,
			confidence_score: r.confidence_score === null ? null : Number(r.confidence_score),
			sent_at: r.sent_at?.toISOString() ?? null,
			engaged_at: r.engaged_at?.toISOString() ?? null,
			redirected_to_google_at: r.redirected_to_google_at?.toISOString() ?? null,
			completed_at: r.completed_at?.toISOString() ?? null,
			expired_at: r.expired_at?.toISOString() ?? null,
			attributed_at: r.attributed_at?.toISOString() ?? null,
			token_expires_at: r.token_expires_at?.toISOString() ?? null,
			created_at: r.created_at.toISOString(),
			is_expired: expired
		};
	});
	return json({ items });
};
