import { json, error } from '@sveltejs/kit';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { appointments, jobs, outboxEvents, type Appointment } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canRescheduleAppointment } from '$lib/server/appointments/permissions';
import { transitionStatusSchema } from '$lib/server/appointments/schemas';
import { repinOneOffJobSchedule } from '$lib/server/jobs/repinSchedule';

const EVENT_TYPE: Record<'completed' | 'cancelled' | 'no_show', string> = {
	completed: 'appointment.completed',
	cancelled: 'appointment.cancelled',
	no_show: 'appointment.no_show'
};

// Minimal job-schedule echo returned to the client after a visit transition so it can
// refresh the job's badge + list row locally — avoiding a full /api/jobs/:id reload
// (~13 queries). Only `repinned` jobs (one-off, not "as needed") get a rewritten
// scheduled_start/end; the visit-truth signals are always recomputed for the badge.
type JobEcho = {
	repinned: boolean;
	scheduled_start: string | null;
	scheduled_end: string | null;
	next_open_visit_start: string | null;
	has_open_visits: boolean;
	// Billing context so the client can raise Jobber's post-completion prompt
	// (Invoice now/later + Close/Leave-open — VisitActionUponComplete, jobber-04 §3.3).
	// `billing_frequency = 'never'` means billing isn't configured → no invoice choice.
	billing_type: 'fixed' | 'visit_based' | null;
	billing_frequency: 'on_completion' | 'per_visit' | 'periodic' | 'never' | null;
	assigned_to: string | null;
};

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function computeJobEcho(
	tx: Tx,
	jobId: string | null,
	orgId: string
): Promise<JobEcho | null> {
	if (!jobId) return null;
	// Repin is a write that must settle before the signal read; the signal aggregate and the
	// job's billing columns are independent reads → one concurrent wave (Rule 20).
	const repinned = await repinOneOffJobSchedule(tx, { orgId, jobId });
	const [sigRows, billingRows] = await Promise.all([
		tx
			.select({
				next_open_visit_start: sql<Date | null>`MIN(${appointments.scheduled_start}) FILTER (WHERE ${appointments.status} = 'scheduled')`,
				has_open_visits: sql<
					boolean | null
				>`bool_or(${appointments.status} IN ('scheduled','unscheduled'))`
			})
			.from(appointments)
			.where(
				and(
					eq(appointments.job_id, jobId),
					eq(appointments.org_id, orgId),
					isNull(appointments.deleted_at)
				)
			),
		tx
			.select({
				billing_type: jobs.billing_type,
				billing_frequency: jobs.billing_frequency,
				assigned_to: jobs.assigned_to
			})
			.from(jobs)
			.where(and(eq(jobs.id, jobId), eq(jobs.org_id, orgId), isNull(jobs.deleted_at)))
			.limit(1)
	]);
	const sig = sigRows[0];
	const billing = billingRows[0];
	return {
		repinned: repinned != null,
		scheduled_start: toISO(repinned?.scheduled_start ?? null),
		scheduled_end: toISO(repinned?.scheduled_end ?? null),
		next_open_visit_start: toISO(sig?.next_open_visit_start ?? null),
		has_open_visits: sig?.has_open_visits ?? false,
		billing_type: (billing?.billing_type as JobEcho['billing_type']) ?? null,
		billing_frequency: (billing?.billing_frequency as JobEcho['billing_frequency']) ?? null,
		assigned_to: billing?.assigned_to ?? null
	};
}

// The raw `sql<Date>` aggregate returns a string from the driver (not a Date), while the
// `repinOneOffJobSchedule` column reads return Date objects. Normalize either to an ISO
// string (or null) so the response shape is stable.
function toISO(v: Date | string | null): string | null {
	if (v == null) return null;
	return v instanceof Date ? v.toISOString() : String(v);
}

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
			const job = await computeJobEcho(tx, reverted.job_id, auth.orgId);
			return { kind: 'ok' as const, row: reverted, job };
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
			// A visit can be completed → marked incomplete → completed again, so the key must
			// carry the transition stamp; a fixed `type:id` key collides on the re-completion.
			// Rapid double-clicks are already blocked by the FOR UPDATE lock + terminal guard.
			idempotency_key: `${EVENT_TYPE[next]}:${updated.id}:${now.getTime()}`
		});

		// Completing/cancelling/no-showing a visit removes it from the job's open set, so
		// re-pin the one-off job to its next open visit (or clear it when none remain).
		if (updated.job_id) {
			await repinOneOffJobSchedule(tx, { orgId: auth.orgId, jobId: updated.job_id });
		}
		const job = await computeJobEcho(tx, updated.job_id, auth.orgId);
		return { kind: 'ok' as const, row: updated, job };
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
			completion_notes: result.row.completion_notes ?? null,
			job: result.kind === 'ok' ? (result.job ?? null) : null
		}
	});
};
