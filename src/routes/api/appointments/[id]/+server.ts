import { json, error } from '@sveltejs/kit';
import { and, eq, isNull, sql } from 'drizzle-orm';
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
		scheduled_start: row.scheduled_start.toISOString(),
		scheduled_end: row.scheduled_end?.toISOString() ?? null,
		location: row.location,
		notes: row.notes,
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
		const lockRows = await tx.execute<Appointment>(sql`
			SELECT * FROM appointments
			WHERE id = ${id}
				AND org_id = ${auth.orgId}
				AND deleted_at IS NULL
			FOR UPDATE
		`);
		const existing = (lockRows as unknown as Appointment[])[0];
		if (!existing) return { kind: 'notFound' as const };

		if (
			existing.status === 'completed' ||
			existing.status === 'cancelled' ||
			existing.status === 'no_show'
		) {
			return { kind: 'terminal' as const, status: existing.status };
		}

		const isReschedule =
			input.scheduled_start !== undefined &&
			input.scheduled_end !== undefined &&
			(input.scheduled_start.getTime() !== existing.scheduled_start.getTime() ||
				input.scheduled_end.getTime() !== (existing.scheduled_end?.getTime() ?? -1));

		const nextStart = input.scheduled_start ?? existing.scheduled_start;
		const nextEnd = input.scheduled_end ?? existing.scheduled_end;

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
			input.scheduled_start !== undefined &&
			input.scheduled_start.getTime() !== existing.scheduled_start.getTime();
		const endChanged =
			input.scheduled_end !== undefined &&
			input.scheduled_end.getTime() !== (existing.scheduled_end?.getTime() ?? -1);
		const crewChanged = crew !== null;

		if ((startChanged || endChanged || crewChanged) && effectiveCrew.length > 0 && nextEnd) {
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
		if (input.scheduled_start !== undefined) updates.scheduled_start = input.scheduled_start;
		if (input.scheduled_end !== undefined) updates.scheduled_end = input.scheduled_end;
		if (input.location !== undefined) updates.location = input.location;
		if (input.notes !== undefined) updates.notes = input.notes;

		if (isReschedule) {
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

		if (isReschedule) {
			const finalLead = crew ? crew.leadMemberId : row.assigned_to;
			await tx.insert(outboxEvents).values({
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
					old_start_at: existing.scheduled_start.toISOString(),
					new_start_at: row.scheduled_start.toISOString(),
					reminder_flags_reset: true
				},
				idempotency_key: `appointment.rescheduled:${row.id}:${row.scheduled_start.toISOString()}`
			});
		}

		return { kind: 'ok' as const, row };
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
	return json({ data: serialize(detail, assignees) });
};
