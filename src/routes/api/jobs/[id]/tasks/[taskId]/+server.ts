import { json, error } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { jobs, jobTasks, orgMembers } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canEditJob } from '$lib/server/jobs/permissions';
import { updateJobTaskSchema } from '$lib/server/jobs/schemas';
import { loadJobTasks } from '$lib/server/jobs/taskResponse';

async function loadTaskForEdit(orgId: string, jobId: string, taskId: string) {
	const [row] = await db
		.select({
			id: jobTasks.id,
			completed: jobTasks.completed,
			job_assigned_to: jobs.assigned_to
		})
		.from(jobTasks)
		.innerJoin(jobs, eq(jobs.id, jobTasks.job_id))
		.where(
			and(
				eq(jobTasks.id, taskId),
				eq(jobTasks.job_id, jobId),
				eq(jobTasks.org_id, orgId),
				isNull(jobTasks.deleted_at),
				isNull(jobs.deleted_at)
			)
		)
		.limit(1);
	return row ?? null;
}

// Edit a task's title/assignee/due date/order, or tick it done/undone. Same edit-access gate as
// creating one; allowed on any job status. Ticking stamps completed_at + completed_by (the person
// checking it off); un-ticking clears both.
export const PATCH: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);

	const jobId = event.params.id!;
	const taskId = event.params.taskId!;

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		error(400, 'Invalid JSON body');
	}

	const parsed = updateJobTaskSchema.safeParse(body);
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

	const found = await loadTaskForEdit(auth.orgId, jobId, taskId);
	if (!found) error(404, 'Task not found');
	if (!canEditJob(auth.member, { assigned_to: found.job_assigned_to })) error(403, 'Forbidden');

	if (input.assigned_to) {
		const [member] = await db
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
		if (!member) return json({ error: 'Assignee is not an active member.' }, { status: 422 });
	}

	const now = new Date();
	const updates: Record<string, unknown> = { updated_at: now };
	if (input.title !== undefined) updates.title = input.title;
	if (input.assigned_to !== undefined) updates.assigned_to = input.assigned_to;
	if (input.due_date !== undefined) updates.due_date = input.due_date;
	if (input.position !== undefined) updates.position = String(input.position);
	// Toggling completed drives the who/when stamp — only rewrite it on an actual state change.
	if (input.completed !== undefined && input.completed !== found.completed) {
		updates.completed = input.completed;
		updates.completed_at = input.completed ? now : null;
		updates.completed_by = input.completed ? auth.member.id : null;
	}

	await db
		.update(jobTasks)
		.set(updates)
		.where(and(eq(jobTasks.id, taskId), eq(jobTasks.org_id, auth.orgId)));

	const tasks = await loadJobTasks(auth.orgId, jobId);
	return json({ data: { tasks } });
};

// Soft-delete (recoverable), matching the time-entry / expense recycle-bin model.
export const DELETE: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);

	const jobId = event.params.id!;
	const taskId = event.params.taskId!;

	const found = await loadTaskForEdit(auth.orgId, jobId, taskId);
	if (!found) error(404, 'Task not found');
	if (!canEditJob(auth.member, { assigned_to: found.job_assigned_to })) error(403, 'Forbidden');

	const now = new Date();
	await db
		.update(jobTasks)
		.set({ deleted_at: now, updated_at: now })
		.where(and(eq(jobTasks.id, taskId), eq(jobTasks.org_id, auth.orgId)));

	const tasks = await loadJobTasks(auth.orgId, jobId);
	return json({ data: { tasks } });
};
