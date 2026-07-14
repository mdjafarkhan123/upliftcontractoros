import { json, error } from '@sveltejs/kit';
import { eq, sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { appointments, outboxEvents, type Appointment } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canRescheduleAppointment } from '$lib/server/appointments/permissions';
import { transitionStatusSchema } from '$lib/server/appointments/schemas';
import { repinOneOffJobSchedule } from '$lib/server/jobs/repinSchedule';

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
		return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 422 });
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

		const now = new Date();

		// ── Mark as incomplete (Jobber's reverse action) ────────────────────────────────
		// Un-complete a completed visit: clear the completion stamp/notes and send it back to
		// 'scheduled' (if it has a date) or 'unscheduled' (if it doesn't). No outbox event —
		// reverting a completion is an internal correction with no client-facing side effect.
		if (next === 'incomplete') {
			if (existing.status !== 'completed') {
				return { kind: 'notCompleted' as const, status: existing.status };
			}
			const revertTo = existing.scheduled_start === null ? 'unscheduled' : 'scheduled';
			const [reverted] = await tx
				.update(appointments)
				.set({
					status: revertTo,
					completed_at: null,
					completed_by: null,
					completion_notes: null,
					updated_at: now
				})
				.where(eq(appointments.id, id))
				.returning();
			// Reviving a visit changes the job's earliest-open visit, so re-pin its schedule copy.
			if (reverted.job_id) {
				await repinOneOffJobSchedule(tx, { orgId: auth.orgId, jobId: reverted.job_id });
			}
			return { kind: 'ok' as const, row: reverted };
		}

		// Forward transitions can't move an already-terminal visit. 'scheduled' and
		// 'unscheduled' are both live sources that may be completed / cancelled / no-showed.
		if (
			existing.status === 'completed' ||
			existing.status === 'cancelled' ||
			existing.status === 'no_show'
		) {
			return { kind: 'terminal' as const, status: existing.status };
		}

		const updates: Record<string, unknown> = { status: next, updated_at: now };
		if (next === 'cancelled') updates.cancelled_at = now;
		// Per-visit completion (S5): stamp who/when and store the crew's completion note.
		if (next === 'completed') {
			updates.completed_at = now;
			updates.completed_by = auth.member.id;
			updates.completion_notes = parsed.data.completion_notes;
		}

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

		// Completing/cancelling/no-showing a visit removes it from the job's open set, so
		// re-pin the one-off job to its next open visit (or clear it when none remain).
		if (updated.job_id) {
			await repinOneOffJobSchedule(tx, { orgId: auth.orgId, jobId: updated.job_id });
		}
		return { kind: 'ok' as const, row: updated };
	});

	if (result.kind === 'notFound') error(404, 'Appointment not found');
	if (result.kind === 'terminal') {
		return json({ error: `Appointment is already ${result.status}.` }, { status: 422 });
	}
	if (result.kind === 'notCompleted') {
		return json({ error: 'Only a completed visit can be marked incomplete.' }, { status: 422 });
	}

	return json({
		data: {
			id: result.row.id,
			status: result.row.status,
			cancelled_at: result.row.cancelled_at?.toISOString() ?? null,
			completed_at: result.row.completed_at?.toISOString() ?? null,
			completed_by: result.row.completed_by ?? null,
			completion_notes: result.row.completion_notes ?? null
		}
	});
};
