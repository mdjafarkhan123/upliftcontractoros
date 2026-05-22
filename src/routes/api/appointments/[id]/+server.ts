import { json, error } from '@sveltejs/kit';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import {
	appointments,
	contacts,
	jobs,
	orgMembers,
	outboxEvents,
	type Appointment
} from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import {
	canRescheduleAppointment,
	canViewAppointment
} from '$lib/server/appointments/permissions';
import { updateAppointmentSchema } from '$lib/server/appointments/schemas';
import { hasOverlap } from '$lib/server/appointments/overlap';

function serialize(row: Appointment & {
	contact_name: string;
	assignee_name: string | null;
	job_title: string | null;
}) {
	return {
		id: row.id,
		contact_id: row.contact_id,
		contact_name: row.contact_name,
		job_id: row.job_id,
		job_title: row.job_title,
		assigned_to: row.assigned_to,
		assignee_name: row.assignee_name,
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
			and(
				eq(appointments.id, id),
				eq(appointments.org_id, orgId),
				isNull(appointments.deleted_at)
			)
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

	return json({ data: serialize(row) });
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

	if (input.assigned_to) {
		const [assignee] = await db
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
		if (!assignee) {
			return json({ error: 'Assignee is not an active member.' }, { status: 422 });
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

		const nextAssignee =
			input.assigned_to !== undefined ? input.assigned_to : existing.assigned_to;
		const nextStart = input.scheduled_start ?? existing.scheduled_start;
		const nextEnd = input.scheduled_end ?? existing.scheduled_end;

		if (nextAssignee && nextStart && nextEnd) {
			const startChanged =
				input.scheduled_start !== undefined &&
				input.scheduled_start.getTime() !== existing.scheduled_start.getTime();
			const endChanged =
				input.scheduled_end !== undefined &&
				input.scheduled_end.getTime() !== (existing.scheduled_end?.getTime() ?? -1);
			const assigneeChanged =
				input.assigned_to !== undefined && input.assigned_to !== existing.assigned_to;

			if (startChanged || endChanged || assigneeChanged) {
				const conflict = await hasOverlap(tx, {
					orgId: auth.orgId,
					assignedTo: nextAssignee,
					start: nextStart,
					end: nextEnd,
					excludeId: id
				});
				if (conflict) return { kind: 'conflict' as const };
			}
		}

		const updates: Record<string, unknown> = { updated_at: new Date() };
		if (input.assigned_to !== undefined) updates.assigned_to = input.assigned_to;
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

		if (isReschedule) {
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
					assigned_to: row.assigned_to,
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
		return json(
			{ error: `Cannot edit a ${updated.status} appointment.` },
			{ status: 422 }
		);
	}
	if (updated.kind === 'conflict') {
		return json({ error: 'Time conflict' }, { status: 409 });
	}

	const detail = await loadDetail(auth.orgId, id);
	if (!detail) error(404, 'Appointment not found');
	return json({ data: serialize(detail) });
};
