import { json, error } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { contacts, jobs, orgMembers, privateFeedback } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canViewNegativeFeedback } from '$lib/server/reputation/permissions';

export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canViewNegativeFeedback(auth.member)) error(403, 'Forbidden');

	const id = event.params.id!;
	const [row] = await db
		.select({
			id: privateFeedback.id,
			contact_id: privateFeedback.contact_id,
			contact_name: contacts.full_name,
			job_id: privateFeedback.job_id,
			job_title: jobs.title,
			score: privateFeedback.score,
			body: privateFeedback.body,
			is_resolved: privateFeedback.is_resolved,
			resolved_at: privateFeedback.resolved_at,
			resolved_by: privateFeedback.resolved_by,
			resolved_by_name: orgMembers.full_name,
			created_at: privateFeedback.created_at
		})
		.from(privateFeedback)
		.innerJoin(contacts, eq(contacts.id, privateFeedback.contact_id))
		.leftJoin(jobs, eq(jobs.id, privateFeedback.job_id))
		.leftJoin(orgMembers, eq(orgMembers.id, privateFeedback.resolved_by))
		.where(
			and(
				eq(privateFeedback.id, id),
				eq(privateFeedback.org_id, auth.orgId),
				isNull(privateFeedback.deleted_at)
			)
		)
		.limit(1);

	if (!row) error(404, 'Not found');
	return json({
		data: {
			...row,
			resolved_at: row.resolved_at?.toISOString() ?? null,
			created_at: row.created_at.toISOString()
		}
	});
};

export const PATCH: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canViewNegativeFeedback(auth.member)) error(403, 'Forbidden');

	const id = event.params.id!;

	const [existing] = await db
		.select({ id: privateFeedback.id, is_resolved: privateFeedback.is_resolved })
		.from(privateFeedback)
		.where(
			and(
				eq(privateFeedback.id, id),
				eq(privateFeedback.org_id, auth.orgId),
				isNull(privateFeedback.deleted_at)
			)
		)
		.limit(1);
	if (!existing) error(404, 'Not found');

	if (existing.is_resolved) {
		// Idempotent: already resolved.
		return json({ data: { id, is_resolved: true } });
	}

	const [updated] = await db
		.update(privateFeedback)
		.set({
			is_resolved: true,
			resolved_by: auth.member.id,
			resolved_at: new Date(),
			updated_at: new Date()
		})
		.where(eq(privateFeedback.id, id))
		.returning({
			id: privateFeedback.id,
			is_resolved: privateFeedback.is_resolved,
			resolved_at: privateFeedback.resolved_at,
			resolved_by: privateFeedback.resolved_by
		});

	return json({
		data: {
			...updated,
			resolved_at: updated.resolved_at?.toISOString() ?? null
		}
	});
};
