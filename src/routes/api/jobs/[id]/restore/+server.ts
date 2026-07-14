import { json, error } from '@sveltejs/kit';
import { and, eq, isNotNull } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { appointments, jobs } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';

/**
 * Restore a soft-deleted job out of the recycle bin.
 *
 * The DELETE handler stamps the job and its still-active visits with the SAME
 * `deleted_at` instant, so we reverse the cascade by clearing `deleted_at` on
 * appointments that share the job's timestamp — visits deleted independently
 * before the job are left as-is. Gated to managers (full-pipeline access), the
 * same bar as deleting a job.
 */
export const POST: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!auth.member.can_view_full_pipeline) error(403, 'Forbidden');

	const id = event.params.id!;

	const [existing] = await db
		.select({ id: jobs.id, deleted_at: jobs.deleted_at })
		.from(jobs)
		.where(and(eq(jobs.id, id), eq(jobs.org_id, auth.orgId), isNotNull(jobs.deleted_at)))
		.limit(1);
	if (!existing) error(404, 'Job not found');

	// Guaranteed non-null by the isNotNull filter above; narrow for type safety.
	const ts = existing.deleted_at;
	if (ts === null) error(404, 'Job not found');

	const now = new Date();
	const restored = await db.transaction(async (tx) => {
		// Reverse the cascade: bring back only the visits removed alongside the job.
		await tx
			.update(appointments)
			.set({ deleted_at: null })
			.where(
				and(
					eq(appointments.org_id, auth.orgId),
					eq(appointments.job_id, id),
					eq(appointments.deleted_at, ts)
				)
			);

		const [row] = await tx
			.update(jobs)
			.set({ deleted_at: null, updated_at: now })
			.where(and(eq(jobs.org_id, auth.orgId), eq(jobs.id, id)))
			.returning({ id: jobs.id });

		return row;
	});

	return json({ job: restored });
};
