import { json, error } from '@sveltejs/kit';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { jobs, jobTasks, orgMembers } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canEditJob } from '$lib/server/jobs/permissions';
import { createJobTaskSchema } from '$lib/server/jobs/schemas';
import { loadJobTasks } from '$lib/server/jobs/taskResponse';

// Add a checklist task to a job. Gate mirrors time entries: edit access to the job (no new
// permission — managing the crew's checklist is core job work). Allowed on any job status, since
// a task list is operational, not financial. Optional assignee must be an active member.
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

	const parsed = createJobTaskSchema.safeParse(body);
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

	// Default a new task to the end of the list when the client sends no explicit slot.
	let position = input.position;
	if (position === undefined) {
		const [maxRow] = await db
			.select({ max: sql<string | null>`max(${jobTasks.position})` })
			.from(jobTasks)
			.where(
				and(eq(jobTasks.job_id, id), eq(jobTasks.org_id, auth.orgId), isNull(jobTasks.deleted_at))
			);
		position = (maxRow?.max != null ? Number(maxRow.max) : 0) + 1;
	}

	await db.insert(jobTasks).values({
		org_id: auth.orgId,
		job_id: id,
		title: input.title,
		assigned_to: input.assigned_to ?? null,
		due_date: input.due_date ?? null,
		position: String(position),
		created_by: auth.member.id
	});

	const tasks = await loadJobTasks(auth.orgId, id);
	return json({ data: { tasks } }, { status: 201 });
};
