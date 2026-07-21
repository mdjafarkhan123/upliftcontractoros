// Read helpers for a job's invoice reminders (the Reminders tab list).

import { and, asc, count, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import {
	jobInvoiceReminderAssignees,
	jobInvoiceReminders,
	jobs,
	orgMembers
} from '$lib/server/db/schema';
import type { JobInvoiceReminderRow } from '$lib/types/jobs';

// Reminders load one page at a time (Jobber shows max 10 per page — ref/billing/16-17).
export const REMINDER_PAGE_SIZE = 10;

export type ReminderPage = { items: JobInvoiceReminderRow[]; total: number };

// Confirms a job exists, belongs to the org, and isn't soft-deleted. Returns the
// job id, or null. Cheap tenant-isolation guard for the reminder routes.
export async function jobInOrg(orgId: string, jobId: string): Promise<string | null> {
	const [row] = await db
		.select({ id: jobs.id })
		.from(jobs)
		.where(and(eq(jobs.id, jobId), eq(jobs.org_id, orgId), isNull(jobs.deleted_at)))
		.limit(1);
	return row?.id ?? null;
}

// One page of a job's live reminders, dated-soonest first, each with its full crew,
// plus the total count for the pager. The page query and the count run concurrently
// (Rule 20); the assignee query then legitimately depends on the page's ids.
export async function loadJobReminders(
	orgId: string,
	jobId: string,
	limit = REMINDER_PAGE_SIZE,
	offset = 0
): Promise<ReminderPage> {
	const where = and(
		eq(jobInvoiceReminders.org_id, orgId),
		eq(jobInvoiceReminders.job_id, jobId),
		isNull(jobInvoiceReminders.deleted_at)
	);

	const [rows, [{ value: total }]] = await Promise.all([
		db
			.select({
				id: jobInvoiceReminders.id,
				description: jobInvoiceReminders.description,
				scheduled_start: jobInvoiceReminders.scheduled_start,
				scheduled_end: jobInvoiceReminders.scheduled_end,
				all_day: jobInvoiceReminders.all_day,
				status: jobInvoiceReminders.status,
				completed_at: jobInvoiceReminders.completed_at,
				notify_team_on_assign: jobInvoiceReminders.notify_team_on_assign,
				assigned_to: jobInvoiceReminders.assigned_to,
				assignee_name: orgMembers.full_name,
				created_at: jobInvoiceReminders.created_at
			})
			.from(jobInvoiceReminders)
			.leftJoin(orgMembers, eq(orgMembers.id, jobInvoiceReminders.assigned_to))
			.where(where)
			// Dated reminders sorted by date; schedule-later (null start) sink last, then by age.
			.orderBy(asc(jobInvoiceReminders.scheduled_start), asc(jobInvoiceReminders.created_at))
			.limit(limit)
			.offset(offset),
		db.select({ value: count() }).from(jobInvoiceReminders).where(where)
	]);

	if (rows.length === 0) return { items: [], total };

	const ids = rows.map((r) => r.id);
	const crew = await db
		.select({
			reminder_id: jobInvoiceReminderAssignees.reminder_id,
			id: orgMembers.id,
			full_name: orgMembers.full_name,
			is_lead: jobInvoiceReminderAssignees.is_lead
		})
		.from(jobInvoiceReminderAssignees)
		.innerJoin(orgMembers, eq(orgMembers.id, jobInvoiceReminderAssignees.member_id))
		.where(inArray(jobInvoiceReminderAssignees.reminder_id, ids))
		.orderBy(sql`${jobInvoiceReminderAssignees.is_lead} DESC`, orgMembers.full_name);

	const byReminder = new Map<string, { id: string; full_name: string; is_lead: boolean }[]>();
	for (const c of crew) {
		const list = byReminder.get(c.reminder_id) ?? [];
		list.push({ id: c.id, full_name: c.full_name, is_lead: c.is_lead });
		byReminder.set(c.reminder_id, list);
	}

	const items = rows.map((r) => ({
		id: r.id,
		description: r.description,
		scheduled_start: r.scheduled_start?.toISOString() ?? null,
		scheduled_end: r.scheduled_end?.toISOString() ?? null,
		all_day: r.all_day,
		status: r.status,
		completed_at: r.completed_at?.toISOString() ?? null,
		notify_team_on_assign: r.notify_team_on_assign,
		assigned_to: r.assigned_to,
		assignee_name: r.assignee_name,
		assignees: byReminder.get(r.id) ?? []
	}));

	return { items, total };
}
