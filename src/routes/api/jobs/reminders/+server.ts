import { json, error } from '@sveltejs/kit';
import { and, asc, eq, gte, inArray, isNotNull, isNull, lt, sql, type SQL } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import {
	contacts,
	jobInvoiceReminderAssignees,
	jobInvoiceReminders,
	jobs,
	orgMembers
} from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canCreateInvoice } from '$lib/server/invoices/permissions';
import type { ReminderCalendarItem } from '$lib/types/reminders';

const MAX_ROWS = 500;

// GET /api/jobs/reminders?from=ISO&to=ISO[&assigned_to=memberId]
// Org-wide windowed feed of DUE invoice reminders (Jobber shows an invoice reminder on the
// schedule only once its trigger date has ARRIVED — it's a "bill this now" queue, not a
// preview of future billing; see help.getjobber.com Reminders on the Schedule). So beyond
// the visible calendar window we also cap at end of today: a future auto-reminder still
// exists on the job's Reminders tab but does NOT land on the calendar until its day comes.
// Schedule-later reminders (no date yet) are excluded — they never hit the grid. Read-only:
// reminders are nudges, not reschedulable work, so there is no PATCH here (edits go through
// the job's own /api/jobs/[id]/reminders/[rid] route).
export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	// Reminders are an invoicing surface — same gate as the job's Reminders tab.
	if (!canCreateInvoice(auth.member)) error(403, 'Forbidden');

	const url = event.url;
	const fromParam = url.searchParams.get('from');
	const toParam = url.searchParams.get('to');
	const assignedToParam = url.searchParams.get('assigned_to');

	if (!fromParam || !toParam) {
		return json(
			{ error: 'from and to query params are required (ISO timestamps).' },
			{ status: 400 }
		);
	}
	const from = new Date(fromParam);
	const to = new Date(toParam);
	if (isNaN(from.getTime()) || isNaN(to.getTime())) {
		return json({ error: 'Invalid from/to date.' }, { status: 400 });
	}
	if (to.getTime() <= from.getTime()) {
		return json({ error: 'to must be after from.' }, { status: 400 });
	}

	// End of today (UTC day boundary, matching how reminder dates are generated in
	// reminderGeneration.ts): a reminder is "due" once its date is reached, and a reminder
	// dated later today still shows for the whole day. Future reminders stay off the grid.
	const now = new Date();
	const dueThrough = new Date(
		Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
	);

	const conditions: SQL[] = [
		eq(jobInvoiceReminders.org_id, auth.orgId),
		isNull(jobInvoiceReminders.deleted_at),
		// Completed reminders leave the calendar too (Jobber shows no "Completed" reminder).
		eq(jobInvoiceReminders.status, 'active'),
		isNotNull(jobInvoiceReminders.scheduled_start),
		gte(jobInvoiceReminders.scheduled_start, from),
		lt(jobInvoiceReminders.scheduled_start, to),
		// Jobber parity: not-yet-due (future) reminders never appear on the calendar.
		lt(jobInvoiceReminders.scheduled_start, dueThrough)
	];

	if (assignedToParam) {
		conditions.push(eq(jobInvoiceReminders.assigned_to, assignedToParam));
	}
	// Restricted-view members only see reminders they're the lead on — mirrors how the
	// calendar already scopes visits + events for that member.
	if (!auth.member.can_view_all_appointments) {
		conditions.push(eq(jobInvoiceReminders.assigned_to, auth.member.id));
	}

	const rows = await db
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
			job_id: jobInvoiceReminders.job_id,
			job_title: jobs.title,
			contact_id: jobs.contact_id,
			contact_name: contacts.full_name,
			contact_phone: contacts.phone,
			contact_email: contacts.email
		})
		.from(jobInvoiceReminders)
		.innerJoin(jobs, eq(jobs.id, jobInvoiceReminders.job_id))
		.innerJoin(contacts, eq(contacts.id, jobs.contact_id))
		.leftJoin(orgMembers, eq(orgMembers.id, jobInvoiceReminders.assigned_to))
		.where(and(...conditions))
		.orderBy(asc(jobInvoiceReminders.scheduled_start), asc(jobInvoiceReminders.id))
		.limit(MAX_ROWS);

	if (rows.length === 0) return json({ items: [] });

	// Full crew per reminder (the detail popover shows the assignee list).
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

	const items: ReminderCalendarItem[] = rows.map((r) => ({
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
		assignees: byReminder.get(r.id) ?? [],
		job_id: r.job_id,
		job_title: r.job_title,
		contact_id: r.contact_id,
		contact_name: r.contact_name,
		contact_phone: r.contact_phone,
		contact_email: r.contact_email
	}));

	return json({ items });
};
