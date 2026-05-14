import { json, error } from '@sveltejs/kit';
import { eq, sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { appointments, outboxEvents, type Appointment } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canRescheduleAppointment } from '$lib/server/appointments/permissions';
import { transitionStatusSchema } from '$lib/server/appointments/schemas';

const EVENT_TYPE: Record<'completed' | 'cancelled' | 'no_show', string> = {
	completed: 'appointment.completed',
	cancelled: 'appointment.cancelled',
	no_show: 'appointment.no_show'
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

	const parsed = transitionStatusSchema.safeParse(body);
	if (!parsed.success) {
		return json(
			{ error: parsed.error.issues[0]?.message ?? 'Invalid input' },
			{ status: 422 }
		);
	}
	const next = parsed.data.status;

	const result = await db.transaction(async (tx) => {
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

		const now = new Date();
		const updates: Record<string, unknown> = { status: next, updated_at: now };
		if (next === 'cancelled') updates.cancelled_at = now;

		const [updated] = await tx
			.update(appointments)
			.set(updates)
			.where(eq(appointments.id, id))
			.returning();

		await tx.insert(outboxEvents).values({
			org_id: auth.orgId,
			event_type: EVENT_TYPE[next],
			resource_type: 'appointment',
			resource_id: updated.id,
			payload: {
				appointment_id: updated.id,
				org_id: auth.orgId,
				contact_id: updated.contact_id,
				job_id: updated.job_id,
				assigned_to: updated.assigned_to,
				transitioned_at: now.toISOString()
			},
			idempotency_key: `${EVENT_TYPE[next]}:${updated.id}`
		});

		return { kind: 'ok' as const, row: updated };
	});

	if (result.kind === 'notFound') error(404, 'Appointment not found');
	if (result.kind === 'terminal') {
		return json(
			{ error: `Appointment is already ${result.status}.` },
			{ status: 422 }
		);
	}

	return json({
		data: {
			id: result.row.id,
			status: result.row.status,
			cancelled_at: result.row.cancelled_at?.toISOString() ?? null
		}
	});
};
