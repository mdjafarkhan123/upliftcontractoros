import { alias } from 'drizzle-orm/pg-core';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { jobTasks, orgMembers } from '$lib/server/db/schema';
import type { JobTaskRow } from '$lib/types/jobs';

/**
 * Re-read a job's checklist tasks after a mutation, mirroring `loadTimeEntriesAndCosting` but far
 * simpler — tasks carry no money, so there's no cost gating and no costing recompute. Ordered by
 * position (the checklist order the crew arranged), then creation as a stable tiebreaker.
 */
export async function loadJobTasks(orgId: string, jobId: string): Promise<JobTaskRow[]> {
	const assignee = alias(orgMembers, 'task_assignee');
	const completer = alias(orgMembers, 'task_completer');

	const rows = await db
		.select({
			id: jobTasks.id,
			title: jobTasks.title,
			completed: jobTasks.completed,
			completed_at: jobTasks.completed_at,
			completed_by: jobTasks.completed_by,
			completed_by_name: completer.full_name,
			assigned_to: jobTasks.assigned_to,
			assignee_name: assignee.full_name,
			due_date: jobTasks.due_date,
			position: jobTasks.position,
			created_at: jobTasks.created_at
		})
		.from(jobTasks)
		.leftJoin(assignee, eq(assignee.id, jobTasks.assigned_to))
		.leftJoin(completer, eq(completer.id, jobTasks.completed_by))
		.where(and(eq(jobTasks.job_id, jobId), eq(jobTasks.org_id, orgId), isNull(jobTasks.deleted_at)))
		.orderBy(asc(jobTasks.position), asc(jobTasks.created_at));

	return rows.map((r) => ({
		id: r.id,
		title: r.title,
		completed: r.completed,
		completed_at: r.completed_at ? r.completed_at.toISOString() : null,
		completed_by: r.completed_by,
		completed_by_name: r.completed_by_name,
		assigned_to: r.assigned_to,
		assignee_name: r.assignee_name,
		due_date: r.due_date,
		position: r.position,
		created_at: r.created_at.toISOString()
	}));
}
