import { json, error } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { jobs, jobTimeEntries, orgMembers } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canEditJob } from '$lib/server/jobs/permissions';
import { canViewCostMargin } from '$lib/server/finance/permissions';
import { updateJobTimeEntrySchema } from '$lib/server/jobs/schemas';
import { loadTimeEntriesAndCosting } from '$lib/server/jobs/timeEntryResponse';

const round2 = (n: number): number => Math.round(n * 100) / 100;

async function loadEntryForEdit(orgId: string, jobId: string, entryId: string) {
	const [row] = await db
		.select({
			id: jobTimeEntries.id,
			org_member_id: jobTimeEntries.org_member_id,
			clock_in: jobTimeEntries.clock_in,
			clock_out: jobTimeEntries.clock_out,
			hourly_rate_snapshot: jobTimeEntries.hourly_rate_snapshot,
			job_assigned_to: jobs.assigned_to
		})
		.from(jobTimeEntries)
		.innerJoin(jobs, eq(jobs.id, jobTimeEntries.job_id))
		.where(
			and(
				eq(jobTimeEntries.id, entryId),
				eq(jobTimeEntries.job_id, jobId),
				eq(jobTimeEntries.org_id, orgId),
				isNull(jobTimeEntries.deleted_at),
				isNull(jobs.deleted_at)
			)
		)
		.limit(1);
	return row ?? null;
}

// Edit an entry's times/notes, or stop a running timer (send clock_out). Same edit-access gate
// as expenses; a non-manager may only touch their own entries. The hourly rate is snapshotted
// the FIRST time an entry gets a clock_out (finalizing its cost) and then stays locked — editing
// the times afterward recomputes duration but never re-prices the hour.
export const PATCH: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);

	const jobId = event.params.id!;
	const entryId = event.params.entryId!;

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		error(400, 'Invalid JSON body');
	}

	const parsed = updateJobTimeEntrySchema.safeParse(body);
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

	const found = await loadEntryForEdit(auth.orgId, jobId, entryId);
	if (!found) error(404, 'Time entry not found');
	if (!canEditJob(auth.member, { assigned_to: found.job_assigned_to })) error(403, 'Forbidden');
	if (found.org_member_id !== auth.member.id && !auth.member.can_view_full_pipeline) {
		return json({ error: 'You can only edit your own time entries.' }, { status: 403 });
	}

	const newClockIn = input.clock_in ? new Date(input.clock_in) : found.clock_in;
	const newClockOut = input.clock_out ? new Date(input.clock_out) : found.clock_out;
	if (newClockOut && newClockOut.getTime() <= newClockIn.getTime()) {
		return json(
			{
				error: 'End time must be after start time.',
				field_errors: { clock_out: 'Must be after start time' }
			},
			{ status: 422 }
		);
	}

	const updates: Record<string, unknown> = { updated_at: new Date() };
	if (input.clock_in !== undefined) updates.clock_in = newClockIn;
	if (input.clock_out !== undefined) updates.clock_out = newClockOut;
	if (input.notes !== undefined) updates.notes = input.notes ?? null;

	if (newClockOut) {
		updates.duration_minutes = String(
			round2((newClockOut.getTime() - newClockIn.getTime()) / 60000)
		);
		if (found.hourly_rate_snapshot == null) {
			const [worker] = await db
				.select({ hourly_cost_rate: orgMembers.hourly_cost_rate })
				.from(orgMembers)
				.where(eq(orgMembers.id, found.org_member_id))
				.limit(1);
			updates.hourly_rate_snapshot = worker?.hourly_cost_rate ?? null;
		}
	} else {
		updates.duration_minutes = null;
	}

	await db
		.update(jobTimeEntries)
		.set(updates)
		.where(and(eq(jobTimeEntries.id, entryId), eq(jobTimeEntries.org_id, auth.orgId)));

	const data = await loadTimeEntriesAndCosting(auth.orgId, jobId, canViewCostMargin(auth.member));
	return json({ data });
};

// Soft-delete (recoverable), matching the expense recycle-bin model.
export const DELETE: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);

	const jobId = event.params.id!;
	const entryId = event.params.entryId!;

	const found = await loadEntryForEdit(auth.orgId, jobId, entryId);
	if (!found) error(404, 'Time entry not found');
	if (!canEditJob(auth.member, { assigned_to: found.job_assigned_to })) error(403, 'Forbidden');
	if (found.org_member_id !== auth.member.id && !auth.member.can_view_full_pipeline) {
		return json({ error: 'You can only delete your own time entries.' }, { status: 403 });
	}

	const now = new Date();
	await db
		.update(jobTimeEntries)
		.set({ deleted_at: now, updated_at: now })
		.where(and(eq(jobTimeEntries.id, entryId), eq(jobTimeEntries.org_id, auth.orgId)));

	const data = await loadTimeEntriesAndCosting(auth.orgId, jobId, canViewCostMargin(auth.member));
	return json({ data });
};
