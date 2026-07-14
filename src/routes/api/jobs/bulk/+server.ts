import { json, error } from '@sveltejs/kit';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { appointments, jobs } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';

// Bulk actions on the jobs list. `delete` soft-deletes each job (stamps
// `deleted_at`, the contacts recycle-bin model) and pulls its still-active
// visits off the calendar — the exact per-job DELETE behavior, applied to a
// selection in one transaction. Destructive, so gated to managers
// (can_view_full_pipeline), the same bar as the single-job delete.
const bulkJobActionSchema = z.object({
	action: z.literal('delete'),
	ids: z.array(z.string().uuid()).min(1).max(200)
});

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

	const parsed = bulkJobActionSchema.safeParse(body);
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 422 });
	}
	const { ids } = parsed.data;

	const now = new Date();
	const deleted = await db.transaction(async (tx) => {
		const rows = await tx
			.update(jobs)
			.set({ deleted_at: now, updated_at: now })
			.where(and(eq(jobs.org_id, auth.orgId), inArray(jobs.id, ids), isNull(jobs.deleted_at)))
			.returning({ id: jobs.id });

		if (rows.length > 0) {
			const deletedIds = rows.map((r) => r.id);
			// Pull each deleted job's own active visits off the calendar alongside it.
			await tx
				.update(appointments)
				.set({ deleted_at: now })
				.where(
					and(
						eq(appointments.org_id, auth.orgId),
						inArray(appointments.job_id, deletedIds),
						isNull(appointments.deleted_at)
					)
				);
		}
		return rows.length;
	});

	return json({ data: { deleted } });
};
