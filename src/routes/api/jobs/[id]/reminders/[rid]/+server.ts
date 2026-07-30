import { json, error } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { jobInvoiceReminders, outboxEvents } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canCreateInvoice } from '$lib/server/invoices/permissions';
import {
	resolveAssigneeInput,
	validateAssigneesBelongToOrg
} from '$lib/server/appointments/assignees';
import { loadReminderAssignees, syncReminderAssignees } from '$lib/server/jobs/reminderAssignees';
import { updateReminderSchema } from '$lib/server/jobs/reminderSchemas';

// PATCH /api/jobs/[id]/reminders/[rid] — edit a reminder AND complete/reopen it
// (Jobber's "mark done"). Any subset of fields may be sent.
export const PATCH: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canCreateInvoice(auth.member)) error(403, 'Forbidden');

	const jobId = event.params.id!;
	const reminderId = event.params.rid!;

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const parsed = updateReminderSchema.safeParse(body);
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

	const assigneesProvided =
		input.assignee_ids !== undefined ||
		input.lead_member_id !== undefined ||
		input.assigned_to !== undefined;

	let crew: { assigneeIds: string[]; leadMemberId: string | null } | null = null;
	if (assigneesProvided) {
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
		crew = { assigneeIds: resolution.assigneeIds, leadMemberId: resolution.leadMemberId };
		if (crew.assigneeIds.length > 0) {
			const orgErr = await validateAssigneesBelongToOrg(db, auth.orgId, crew.assigneeIds);
			if (orgErr) {
				return json(
					{ error: orgErr.message, field_errors: { [orgErr.field]: orgErr.message } },
					{ status: 422 }
				);
			}
		}
	}

	const result = await db.transaction(async (tx) => {
		const [existing] = await tx
			.select()
			.from(jobInvoiceReminders)
			.where(
				and(
					eq(jobInvoiceReminders.id, reminderId),
					eq(jobInvoiceReminders.job_id, jobId),
					eq(jobInvoiceReminders.org_id, auth.orgId),
					isNull(jobInvoiceReminders.deleted_at)
				)
			)
			.for('update')
			.limit(1);
		if (!existing) return { kind: 'notFound' as const };

		const nextAllDay = input.all_day ?? existing.all_day;

		const updates: Record<string, unknown> = { updated_at: new Date() };
		if (input.description !== undefined) updates.description = input.description;
		if (input.all_day !== undefined) updates.all_day = input.all_day;
		if (input.scheduled_start !== undefined) {
			updates.scheduled_start = input.scheduled_start;
			// Re-dating a reminder re-arms its due nudge: the due-sweep cron fires again once the
			// new date arrives (job-invoice-reminder-due-sweep gates on due_notified_at IS NULL).
			updates.due_notified_at = null;
		}
		// Becoming all-day / anytime clears the end; otherwise honour an explicit end change.
		if (nextAllDay) updates.scheduled_end = null;
		else if (input.scheduled_end !== undefined) updates.scheduled_end = input.scheduled_end;
		if (input.notify_team_on_assign !== undefined)
			updates.notify_team_on_assign = input.notify_team_on_assign;

		// Complete / reopen: stamp or clear the completion audit fields.
		if (input.status !== undefined && input.status !== existing.status) {
			updates.status = input.status;
			if (input.status === 'completed') {
				updates.completed_at = new Date();
				updates.completed_by = auth.member.id;
			} else {
				updates.completed_at = null;
				updates.completed_by = null;
			}
		}

		// "Email team when assigned" — effective flag = the change, else the stored value.
		const notifyOnAssign =
			input.notify_team_on_assign !== undefined
				? input.notify_team_on_assign
				: existing.notify_team_on_assign;

		// Capture the prior crew BEFORE the sync replaces it, so we can notify only the
		// members who are NEWLY added (re-saving an unchanged reminder must not re-alert).
		let priorAssigneeIds: string[] = [];
		if (crew && notifyOnAssign) {
			priorAssigneeIds = (await loadReminderAssignees(tx, reminderId)).map((a) => a.id);
		}

		await tx.update(jobInvoiceReminders).set(updates).where(eq(jobInvoiceReminders.id, reminderId));

		// Sync crew AFTER the main UPDATE so the helper's write to assigned_to wins.
		if (crew) {
			await syncReminderAssignees(tx, {
				orgId: auth.orgId,
				reminderId,
				assigneeIds: crew.assigneeIds,
				leadMemberId: crew.leadMemberId
			});
		}

		if (crew && notifyOnAssign) {
			const prior = new Set(priorAssigneeIds);
			const newcomers = crew.assigneeIds.filter((id) => !prior.has(id));
			if (newcomers.length > 0) {
				await tx.insert(outboxEvents).values({
					org_id: auth.orgId,
					event_type: 'job_invoice_reminder.assigned',
					resource_type: 'job_invoice_reminder',
					resource_id: reminderId,
					payload: {
						reminder_id: reminderId,
						org_id: auth.orgId,
						job_id: jobId,
						assignee_ids: newcomers
					},
					// Keyed by the exact recipient set so re-adding the same members is deduped,
					// while adding a genuinely new member fires a fresh event.
					idempotency_key: `job_invoice_reminder.assigned:${reminderId}:${[...newcomers]
						.sort()
						.join('.')}`
				});
			}
		}

		return { kind: 'ok' as const };
	});

	if (result.kind === 'notFound') error(404, 'Reminder not found');
	return json({ data: { id: reminderId } });
};

// DELETE /api/jobs/[id]/reminders/[rid] — soft-delete a reminder.
export const DELETE: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canCreateInvoice(auth.member)) error(403, 'Forbidden');

	const jobId = event.params.id!;
	const reminderId = event.params.rid!;

	const [row] = await db
		.update(jobInvoiceReminders)
		.set({ deleted_at: new Date(), updated_at: new Date() })
		.where(
			and(
				eq(jobInvoiceReminders.id, reminderId),
				eq(jobInvoiceReminders.job_id, jobId),
				eq(jobInvoiceReminders.org_id, auth.orgId),
				isNull(jobInvoiceReminders.deleted_at)
			)
		)
		.returning({ id: jobInvoiceReminders.id });

	if (!row) error(404, 'Reminder not found');
	return new Response(null, { status: 204 });
};
