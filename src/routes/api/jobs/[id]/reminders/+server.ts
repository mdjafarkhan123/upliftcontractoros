import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { jobInvoiceReminders, outboxEvents } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canCreateInvoice } from '$lib/server/invoices/permissions';
import {
	resolveAssigneeInput,
	validateAssigneesBelongToOrg
} from '$lib/server/appointments/assignees';
import { syncReminderAssignees } from '$lib/server/jobs/reminderAssignees';
import { createReminderSchema } from '$lib/server/jobs/reminderSchemas';
import { jobInOrg, loadJobReminders, REMINDER_PAGE_SIZE } from '$lib/server/jobs/reminders';

// GET /api/jobs/[id]/reminders?page=N — one page (10) of this job's invoice reminders
// (Reminders tab, Jobber ref/billing/16-17). Returns items + total for the pager.
export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);

	const jobId = event.params.id!;
	if (!(await jobInOrg(auth.orgId, jobId))) error(404, 'Job not found');

	const pageParam = Number(event.url.searchParams.get('page'));
	const page = Number.isFinite(pageParam) && pageParam >= 1 ? Math.floor(pageParam) : 1;

	const { items, total } = await loadJobReminders(
		auth.orgId,
		jobId,
		REMINDER_PAGE_SIZE,
		(page - 1) * REMINDER_PAGE_SIZE
	);
	return json({ data: { items, total, page, page_size: REMINDER_PAGE_SIZE } });
};

// POST /api/jobs/[id]/reminders — create an invoice reminder for the job.
export const POST: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canCreateInvoice(auth.member)) error(403, 'Forbidden');

	const jobId = event.params.id!;
	if (!(await jobInOrg(auth.orgId, jobId))) error(404, 'Job not found');

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const parsed = createReminderSchema.safeParse(body);
	if (!parsed.success) {
		const field_errors: Record<string, string> = {};
		for (const issue of parsed.error.issues) {
			const path = issue.path.join('.');
			if (path && !field_errors[path]) field_errors[path] = issue.message;
		}
		return json(
			{ error: parsed.error.issues[0]?.message ?? 'Invalid input', field_errors },
			{ status: 422 }
		);
	}
	const input = parsed.data;

	const resolution = resolveAssigneeInput({
		assignee_ids: input.assignee_ids,
		lead_member_id: input.lead_member_id,
		assigned_to: input.assigned_to
	});
	if ('field' in resolution) {
		return json(
			{ error: resolution.message, field_errors: { [resolution.field]: resolution.message } },
			{ status: 422 }
		);
	}
	const { assigneeIds, leadMemberId } = resolution;

	if (assigneeIds.length > 0) {
		const orgErr = await validateAssigneesBelongToOrg(db, auth.orgId, assigneeIds);
		if (orgErr) {
			return json(
				{ error: orgErr.message, field_errors: { [orgErr.field]: orgErr.message } },
				{ status: 422 }
			);
		}
	}

	const created = await db.transaction(async (tx) => {
		const [inserted] = await tx
			.insert(jobInvoiceReminders)
			.values({
				org_id: auth.orgId,
				job_id: jobId,
				assigned_to: leadMemberId,
				description: input.description ?? null,
				all_day: input.all_day,
				scheduled_start: input.scheduled_start ?? null,
				// All-day / anytime reminders carry no end time.
				scheduled_end: input.all_day ? null : (input.scheduled_end ?? null),
				notify_team_on_assign: input.notify_team_on_assign,
				created_by: auth.member.id
			})
			.returning({ id: jobInvoiceReminders.id });

		if (assigneeIds.length > 0) {
			await syncReminderAssignees(tx, {
				orgId: auth.orgId,
				reminderId: inserted.id,
				assigneeIds,
				leadMemberId
			});
		}

		// "Email team when assigned" — notify the assigned crew. The send goes through the
		// outbox (transaction-boundary law: the business write + this event commit together,
		// the actual email/in-app alert is fanned out later by the notification worker).
		if (input.notify_team_on_assign && assigneeIds.length > 0) {
			await tx.insert(outboxEvents).values({
				org_id: auth.orgId,
				event_type: 'job_invoice_reminder.assigned',
				resource_type: 'job_invoice_reminder',
				resource_id: inserted.id,
				payload: {
					reminder_id: inserted.id,
					org_id: auth.orgId,
					job_id: jobId,
					// The members to alert — everyone assigned on create.
					assignee_ids: assigneeIds
				},
				idempotency_key: `job_invoice_reminder.assigned:${inserted.id}:${[...assigneeIds]
					.sort()
					.join('.')}`
			});
		}

		return inserted;
	});

	return json({ data: { id: created.id } }, { status: 201 });
};
