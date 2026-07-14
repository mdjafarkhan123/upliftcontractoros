import { json, error } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { jobs, jobTimeEntries, orgMembers } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canEditJob } from '$lib/server/jobs/permissions';
import { canViewCostMargin } from '$lib/server/finance/permissions';
import { createJobTimeEntrySchema } from '$lib/server/jobs/schemas';
import { loadTimeEntriesAndCosting } from '$lib/server/jobs/timeEntryResponse';

// Start a timer (clock_out omitted) or log a completed manual entry (clock_in + clock_out both
// given). Gate mirrors expenses: edit access to the job. Unlike expenses, this does NOT require
// can_view_revenue — a field tech who can't see costs can still track their own hours; the
// echoed response strips the $ side for them. Anyone without full-pipeline access may only log
// time against themself (can't punch a coworker in).
export const POST: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);

	const id = event.params.id!;

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		error(400, 'Invalid JSON body');
	}

	const parsed = createJobTimeEntrySchema.safeParse(body);
	if (!parsed.success) {
		const field_errors: Record<string, string> = {};
		for (const issue of parsed.error.issues) {
			const p = issue.path.join('.');
			if (p && !field_errors[p]) field_errors[p] = issue.message;
		}
		return json(
			{ error: parsed.error.issues[0]?.message ?? 'Invalid input', field_errors },
			{ status: 422 }
		);
	}
	const input = parsed.data;

	const [job] = await db
		.select({ id: jobs.id, assigned_to: jobs.assigned_to })
		.from(jobs)
		.where(and(eq(jobs.id, id), eq(jobs.org_id, auth.orgId), isNull(jobs.deleted_at)))
		.limit(1);
	if (!job) error(404, 'Job not found');
	if (!canEditJob(auth.member, { assigned_to: job.assigned_to })) error(403, 'Forbidden');

	const workerId = input.org_member_id ?? auth.member.id;
	if (workerId !== auth.member.id && !auth.member.can_view_full_pipeline) {
		return json({ error: 'You can only log your own time.' }, { status: 403 });
	}

	const [worker] = await db
		.select({ id: orgMembers.id, hourly_cost_rate: orgMembers.hourly_cost_rate })
		.from(orgMembers)
		.where(
			and(
				eq(orgMembers.id, workerId),
				eq(orgMembers.org_id, auth.orgId),
				isNull(orgMembers.deleted_at)
			)
		)
		.limit(1);
	if (!worker) return json({ error: 'Team member not found.' }, { status: 422 });

	const clockIn = input.clock_in ? new Date(input.clock_in) : new Date();
	const clockOut = input.clock_out ? new Date(input.clock_out) : null;
	const durationMinutes = clockOut
		? String(round2Minutes((clockOut.getTime() - clockIn.getTime()) / 60000))
		: null;

	await db.insert(jobTimeEntries).values({
		org_id: auth.orgId,
		job_id: id,
		org_member_id: workerId,
		clock_in: clockIn,
		clock_out: clockOut,
		duration_minutes: durationMinutes,
		hourly_rate_snapshot: clockOut ? worker.hourly_cost_rate : null,
		notes: input.notes ?? null,
		created_by: auth.member.id
	});

	const data = await loadTimeEntriesAndCosting(auth.orgId, id, canViewCostMargin(auth.member));
	return json({ data }, { status: 201 });
};

function round2Minutes(n: number): number {
	return Math.round(n * 100) / 100;
}
