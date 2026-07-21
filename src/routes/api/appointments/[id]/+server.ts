import { json, error } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import {
	appointmentAssignees,
	appointments,
	contacts,
	jobs,
	orgMembers,
	outboxEvents,
	type Appointment
} from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canRescheduleAppointment, canViewAppointment } from '$lib/server/appointments/permissions';
import { updateAppointmentSchema } from '$lib/server/appointments/schemas';
import { findConflictingAssignee } from '$lib/server/appointments/overlap';
import {
	loadAssignees,
	resolveAssigneeInput,
	syncAppointmentAssignees,
	validateAssigneesBelongToOrg,
	type AssigneeRow
} from '$lib/server/appointments/assignees';
import { repinOneOffJobSchedule } from '$lib/server/jobs/repinSchedule';

function serialize(
	row: Appointment & {
		contact_name: string;
		assignee_name: string | null;
		job_title: string | null;
	},
	assignees: AssigneeRow[]
) {
	return {
		id: row.id,
		contact_id: row.contact_id,
		contact_name: row.contact_name,
		job_id: row.job_id,
		job_title: row.job_title,
		assigned_to: row.assigned_to,
		assignee_name: row.assignee_name,
		assignees,
		type: row.type,
		status: row.status,
		title: row.title,
		all_day: row.all_day,
		// NULL for an unscheduled visit (Jobber "Schedule later").
		scheduled_start: row.scheduled_start?.toISOString() ?? null,
		scheduled_end: row.scheduled_end?.toISOString() ?? null,
		location: row.location,
		notes: row.notes,
		completion_notes: row.completion_notes,
		reminder_24h_sent: row.reminder_24h_sent,
		reminder_1h_sent: row.reminder_1h_sent,
		cancelled_at: row.cancelled_at?.toISOString() ?? null,
		created_at: row.created_at.toISOString(),
		updated_at: row.updated_at.toISOString(),
		booking_source: row.booking_source,
		booked_via_link_id: row.booked_via_link_id,
		customer_name: row.customer_name,
		customer_phone: row.customer_phone,
		customer_email: row.customer_email,
		customer_notes: row.customer_notes,
		booking_referrer: row.booking_referrer
	};
}

async function loadDetail(orgId: string, id: string) {
	const [row] = await db
		.select({
			appt: appointments,
			contact_name: contacts.full_name,
			assignee_name: orgMembers.full_name,
			job_title: jobs.title
		})
		.from(appointments)
		.innerJoin(contacts, eq(contacts.id, appointments.contact_id))
		.leftJoin(orgMembers, eq(orgMembers.id, appointments.assigned_to))
		.leftJoin(jobs, eq(jobs.id, appointments.job_id))
		.where(
			and(eq(appointments.id, id), eq(appointments.org_id, orgId), isNull(appointments.deleted_at))
		)
		.limit(1);
	if (!row) return null;
	return {
		...row.appt,
		contact_name: row.contact_name,
		assignee_name: row.assignee_name,
		job_title: row.job_title
	};
}

export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);

	const id = event.params.id!;
	const row = await loadDetail(auth.orgId, id);
	if (!row) error(404, 'Appointment not found');
	if (!canViewAppointment(auth.member, { assigned_to: row.assigned_to })) {
		error(403, 'Forbidden');
	}

	const assignees = await loadAssignees(db, id);
	return json({ data: serialize(row, assignees) });
};

export const PATCH: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canRescheduleAppointment(auth.member)) error(403, 'Forbidden');

	const id = event.params.id!;

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const parsed = updateAppointmentSchema.safeParse(body);
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

	// Did the caller try to change the crew at all? (Any of the three keys present.)
	const assigneesProvided =
		input.assignee_ids !== undefined ||
		input.lead_member_id !== undefined ||
		input.assigned_to !== undefined;

	// The Visit Details modal's Notes tab only ever sends `completion_notes`. When that's the
	// SOLE change, take a light path that skips all reschedule/overlap/re-pin logic and — unlike a
	// schedule edit — is allowed on a completed/cancelled visit (a per-visit note is free text, not
	// a schedule change, and notes are shown on completed visits).
	const notesOnly =
		input.completion_notes !== undefined &&
		input.type === undefined &&
		input.title === undefined &&
		input.all_day === undefined &&
		input.scheduled_start === undefined &&
		input.scheduled_end === undefined &&
		input.location === undefined &&
		input.notes === undefined &&
		!assigneesProvided &&
		(!input.notify_channel || input.notify_channel === 'none');

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

	const updated = await db.transaction(async (tx) => {
		// Lock the row for the duration of the txn. Use Drizzle's typed select
		// (not raw `SELECT *`) so timestamp columns deserialize to JS Date objects —
		// a raw execute returns them as strings, which breaks the .getTime() checks below.
		const [existing] = await tx
			.select()
			.from(appointments)
			.where(
				and(
					eq(appointments.id, id),
					eq(appointments.org_id, auth.orgId),
					isNull(appointments.deleted_at)
				)
			)
			.for('update')
			.limit(1);
		if (!existing) return { kind: 'notFound' as const };

		// Notes-only edit: update the free note in place, on any status, and return. No slot moved,
		// so no reminders reset, no re-pin, no outbox event.
		if (notesOnly) {
			const [row] = await tx
				.update(appointments)
				.set({ completion_notes: input.completion_notes, updated_at: new Date() })
				.where(eq(appointments.id, id))
				.returning();
			return { kind: 'ok' as const, row, repinnedJob: null };
		}

		// A cancelled / no-show visit stays locked — reviving it is a deliberate status action,
		// not a calendar drag. A COMPLETED visit, however, may still be moved and reassigned:
		// dragging it just corrects its date/time/crew and keeps it completed (Jobber's
		// per-visit `visitEdit` — the "completed visits never change" rule only governs job
		// recurrence edits, not moving one visit by hand). See the isCompleted quiet-path below.
		if (existing.status === 'cancelled' || existing.status === 'no_show') {
			return { kind: 'terminal' as const, status: existing.status };
		}
		// Moving a completed visit is a historical correction: it must NOT reset reminders or
		// fire the staff "rescheduled" notification (the work is already done). The status stays
		// `completed` on its own — none of the status-flip branches below touch a completed row.
		const isCompleted = existing.status === 'completed';

		// Anytime toggle: `all_day` may flip on/off; when on, the visit carries no end.
		const nextAllDay = input.all_day ?? existing.all_day;
		const allDayChanged = input.all_day !== undefined && input.all_day !== existing.all_day;

		const nextStart = input.scheduled_start ?? existing.scheduled_start;
		const nextEnd = nextAllDay ? null : (input.scheduled_end ?? existing.scheduled_end);

		// Resolve the effective crew for overlap checking. If the caller didn't
		// touch assignees, use the existing crew from the join table.
		let effectiveCrew: string[];
		if (crew) {
			effectiveCrew = crew.assigneeIds;
		} else {
			const rows = await tx
				.select({ id: appointmentAssignees.member_id })
				.from(appointmentAssignees)
				.where(eq(appointmentAssignees.appointment_id, id));
			effectiveCrew = rows.map((r) => r.id);
		}

		const startChanged =
			input.scheduled_start != null &&
			// A previously unscheduled visit (null start) gaining a date counts as a change.
			(existing.scheduled_start === null ||
				input.scheduled_start.getTime() !== existing.scheduled_start.getTime());
		const endChanged = (nextEnd?.getTime() ?? null) !== (existing.scheduled_end?.getTime() ?? null);
		const crewChanged = crew !== null;

		// A "reschedule" for reminder/notify purposes = the slot moved in any way:
		// start moved, end moved, or the timed⇄anytime nature flipped.
		const isReschedule = startChanged || endChanged || allDayChanged;

		// Explicit un-schedule: the visit editor sends scheduled_start:null to send a dated,
		// still-open visit back to an "unscheduled" placeholder (Jobber: startAt/endAt null +
		// status UNSCHEDULED — the row survives, still completable/editable). Distinct from an
		// omitted start (undefined = "leave the date alone"). Only a currently-scheduled visit
		// can be un-scheduled; a placeholder sent null again is a no-op.
		const unscheduling =
			input.scheduled_start === null &&
			existing.scheduled_start !== null &&
			existing.status === 'scheduled';

		// Anything that changed the slot — a move OR an un-schedule — must reset reminders and
		// re-pin the parent job's denormalized schedule.
		const scheduleChanged = isReschedule || unscheduling;

		// Only timed visits with a crew can time-conflict — Anytime visits never do.
		if (
			(startChanged || endChanged || crewChanged) &&
			effectiveCrew.length > 0 &&
			!nextAllDay &&
			nextEnd &&
			nextStart
		) {
			const conflictMember = await findConflictingAssignee(tx, {
				orgId: auth.orgId,
				assigneeIds: effectiveCrew,
				start: nextStart,
				end: nextEnd,
				excludeId: id
			});
			if (conflictMember) return { kind: 'conflict' as const };
		}

		const updates: Record<string, unknown> = { updated_at: new Date() };
		if (input.type !== undefined) updates.type = input.type;
		if (input.title !== undefined) updates.title = input.title;
		if (input.all_day !== undefined) updates.all_day = input.all_day;
		if (unscheduling) {
			// Send the visit back to a placeholder: clear both dates. Status flips below.
			updates.scheduled_start = null;
			updates.scheduled_end = null;
		} else {
			if (input.scheduled_start != null) updates.scheduled_start = input.scheduled_start;
			// Becoming Anytime clears the end; otherwise honour an explicit end change.
			if (nextAllDay) updates.scheduled_end = null;
			else if (input.scheduled_end !== undefined) updates.scheduled_end = input.scheduled_end;
		}
		if (input.location !== undefined) updates.location = input.location;
		if (input.notes !== undefined) updates.notes = input.notes;
		if (input.completion_notes !== undefined) updates.completion_notes = input.completion_notes;
		// Promote a "Schedule later" placeholder the moment it gains a date: an unscheduled
		// visit given a start becomes a real scheduled visit, so it lands on the calendar AND
		// the reminder worker (which gates on status === 'scheduled') enrolls it. startChanged
		// above already flagged this null→date move, so isReschedule fires the outbox event.
		if (unscheduling) updates.status = 'unscheduled';
		else if (existing.status === 'unscheduled' && nextStart != null) updates.status = 'scheduled';

		if (scheduleChanged && !isCompleted) {
			updates.reminder_24h_sent = false;
			updates.reminder_1h_sent = false;
		}

		const [row] = await tx
			.update(appointments)
			.set(updates)
			.where(eq(appointments.id, id))
			.returning();

		// Sync the crew AFTER the main UPDATE so the helper's own write to
		// assigned_to wins (this is a no-op if crew unchanged).
		if (crew) {
			await syncAppointmentAssignees(tx, {
				orgId: auth.orgId,
				appointmentId: id,
				assigneeIds: crew.assigneeIds,
				leadMemberId: crew.leadMemberId
			});
		}

		// Keep the parent job's schedule in lockstep when its visit moves. For a one-off job the
		// visit IS the job's schedule (Jobber / Housecall Pro), so dating/moving one must re-point
		// the job to its earliest OPEN visit — not blindly to THIS visit, which would wrongly drag
		// the job's anchor onto a later visit when a multi-visit job edits a non-earliest one.
		// Recurring jobs are excluded inside the helper (the job row stays the series anchor).
		let repinnedJob: {
			id: string;
			scheduled_start: string | null;
			scheduled_end: string | null;
		} | null = null;
		if (scheduleChanged && row.job_id) {
			const repinned = await repinOneOffJobSchedule(tx, { orgId: auth.orgId, jobId: row.job_id });
			// `repinned` is null for a recurring/deleted job (no row updated) — nothing to echo.
			if (repinned) {
				repinnedJob = {
					id: row.job_id,
					scheduled_start: repinned.scheduled_start?.toISOString() ?? null,
					scheduled_end: repinned.scheduled_end?.toISOString() ?? null
				};
			}
		}

		// Enter when the slot actually moved OR the caller asked to notify the client.
		// The two-step drag flow saves the move first (notify_channel:'none') and then,
		// in a follow-up PATCH whose time is unchanged, opts to notify — so the client
		// confirmation must be reachable even when isReschedule is false.
		if (isReschedule || (input.notify_channel && input.notify_channel !== 'none')) {
			const finalLead = crew ? crew.leadMemberId : row.assigned_to;
			// Staff-facing reschedule event fires ONLY when the slot genuinely moved — and never
			// for a completed visit, whose move is a silent historical correction (see isCompleted).
			if (isReschedule && !isCompleted)
				await tx
					.insert(outboxEvents)
					.values({
						org_id: auth.orgId,
						event_type: 'appointment.rescheduled',
						resource_type: 'appointment',
						resource_id: row.id,
						payload: {
							appointment_id: row.id,
							org_id: auth.orgId,
							contact_id: row.contact_id,
							job_id: row.job_id,
							assigned_to: finalLead,
							assignee_ids: effectiveCrew,
							old_start_at: existing.scheduled_start?.toISOString() ?? null,
							new_start_at: row.scheduled_start?.toISOString() ?? null,
							reminder_flags_reset: true
						},
						idempotency_key: `appointment.rescheduled:${row.id}:${row.scheduled_start?.toISOString() ?? row.updated_at.toISOString()}`
					})
					// The idempotency_key (…:<new start>) is deliberately deterministic so a
					// repeat save to the same time dedupes. Skip on collision instead of
					// throwing — dragging a visit away and back, or flipping Anytime⇄timed at the
					// same clock time, would otherwise 500 and roll back the whole reschedule.
					.onConflictDoNothing({ target: outboxEvents.idempotency_key });

			// Client-facing "your appointment moved to…" confirmation, gated to the
			// channel the contractor picked in the drag-confirm popover. Separate
			// event from appointment.rescheduled (which only re-anchors reminders +
			// notifies staff) so the client send is opt-in per reschedule, mirroring
			// the job.scheduled reschedule confirmation. The time-stamped key makes
			// each distinct new time its own event and dedupes a repeat save.
			if (input.notify_channel && input.notify_channel !== 'none') {
				await tx
					.insert(outboxEvents)
					.values({
						org_id: auth.orgId,
						event_type: 'appointment.reschedule_confirmation',
						resource_type: 'appointment',
						resource_id: row.id,
						payload: {
							appointment_id: row.id,
							org_id: auth.orgId,
							contact_id: row.contact_id,
							channel: input.notify_channel,
							scheduled_start: row.scheduled_start?.toISOString() ?? null,
							// Per-reschedule copy overrides (null = worker falls back to the org template).
							sms_message: input.notify_sms_message ?? null,
							email_subject: input.notify_email_subject ?? null,
							email_message: input.notify_email_message ?? null
						},
						idempotency_key: `appointment.reschedule_confirmation:${row.id}:${row.scheduled_start?.toISOString() ?? row.updated_at.toISOString()}`
					})
					.onConflictDoNothing({ target: outboxEvents.idempotency_key });
			}
		}

		return { kind: 'ok' as const, row, repinnedJob };
	});

	if (updated.kind === 'notFound') error(404, 'Appointment not found');
	if (updated.kind === 'terminal') {
		return json({ error: `Cannot edit a ${updated.status} appointment.` }, { status: 422 });
	}
	if (updated.kind === 'conflict') {
		return json({ error: 'Time conflict' }, { status: 409 });
	}

	const detail = await loadDetail(auth.orgId, id);
	if (!detail) error(404, 'Appointment not found');
	const assignees = await loadAssignees(db, id);
	return json({ data: { ...serialize(detail, assignees), affected_job: updated.repinnedJob } });
};
