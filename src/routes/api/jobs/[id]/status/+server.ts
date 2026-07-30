import { json, error } from '@sveltejs/kit';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { jobInvoiceReminders, jobs, outboxEvents } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canCancelJob, canEditJob } from '$lib/server/jobs/permissions';
import { transitionStatusSchema } from '$lib/server/jobs/schemas';

// Jobber model: jobs.status is open (`active`) vs closed (`archived`). The three lifecycle actions:
//   • complete — close a live job as finished  (active  → archived, completed_at set)
//   • cancel   — close a live job as called off (active  → archived, cancelled_at set)
//   • reopen   — reopen a closed job            (archived → active, both timestamps cleared)
// The close REASON lives in the timestamps (Jobber persists only `archived`), and those timestamps
// drive the job.completed / job.cancelled outbox events + the review automation.
type Action = 'complete' | 'cancel' | 'reopen';

// Which actions are legal from each stored state.
const ALLOWED: Record<'active' | 'archived', Action[]> = {
	active: ['complete', 'cancel'],
	archived: ['reopen']
};

export const PATCH: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);

	const id = event.params.id!;

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		error(400, 'Invalid JSON body');
	}

	const parsed = transitionStatusSchema.safeParse(body);
	if (!parsed.success) {
		return json(
			{ error: parsed.error.issues[0]?.message ?? 'Invalid input', code: 'VALIDATION_ERROR' },
			{ status: 422 }
		);
	}
	const action = parsed.data.action;

	const [existing] = await db
		.select({
			id: jobs.id,
			status: jobs.status,
			assigned_to: jobs.assigned_to,
			billing_frequency: jobs.billing_frequency
		})
		.from(jobs)
		.where(and(eq(jobs.id, id), eq(jobs.org_id, auth.orgId), isNull(jobs.deleted_at)))
		.limit(1);
	if (!existing) error(404, 'Job not found');

	if (!canEditJob(auth.member, { assigned_to: existing.assigned_to })) {
		error(403, 'Forbidden');
	}
	if (action === 'cancel' && !canCancelJob(auth.member)) {
		error(403, 'Forbidden');
	}

	if (!ALLOWED[existing.status].includes(action)) {
		return json(
			{
				error: `Cannot ${action} a job that is ${existing.status}.`,
				code: 'INVALID_TRANSITION'
			},
			{ status: 422 }
		);
	}

	const result = await db.transaction(async (tx) => {
		const now = new Date();
		const updates: Record<string, unknown> = { updated_at: now };
		if (action === 'complete') {
			updates.status = 'archived';
			updates.completed_at = now;
			updates.cancelled_at = null;
		} else if (action === 'cancel') {
			updates.status = 'archived';
			updates.cancelled_at = now;
			updates.completed_at = null;
		} else {
			// reopen
			updates.status = 'active';
			updates.completed_at = null;
			updates.cancelled_at = null;
		}

		// The initial read authorizes the transition; this conditional update makes that transition
		// atomic. If two people close the same open job at once, only the first transaction changes
		// the state and emits its lifecycle event. The second receives a conflict instead of creating
		// a duplicate automation event.
		const [updated] = await tx
			.update(jobs)
			.set(updates)
			.where(and(eq(jobs.id, id), eq(jobs.status, existing.status)))
			.returning();
		if (!updated) return null;

		if (action === 'complete') {
			// Date the on-completion invoice reminder. A job billed 'on_completion' with no
			// planned end date carries an undated ("schedule later") auto reminder — the only
			// live auto row with a NULL start and no visit link (per_visit/periodic auto rows
			// are always dated). Closing the job is the moment it comes due, so we stamp it
			// with the close instant so it stops reading "Unscheduled" and lands on the calendar.
			await tx
				.update(jobInvoiceReminders)
				.set({ scheduled_start: now, updated_at: now })
				.where(
					and(
						eq(jobInvoiceReminders.org_id, auth.orgId),
						eq(jobInvoiceReminders.job_id, id),
						eq(jobInvoiceReminders.source, 'auto'),
						eq(jobInvoiceReminders.status, 'active'),
						isNull(jobInvoiceReminders.visit_id),
						isNull(jobInvoiceReminders.scheduled_start),
						isNull(jobInvoiceReminders.deleted_at)
					)
				);

			// Closing a job clears its stray reminders — the job is finished, so future per-visit /
			// periodic auto reminders and any leftover manual reminders no longer apply. The one
			// exception: an on_completion job's auto nudge reminder (auto + no visit) stays ACTIVE
			// so a finished-but-unbilled job still prompts "time to invoice" (dated just above).
			const keepOnCompletionNudge = existing.billing_frequency === 'on_completion';
			await tx
				.update(jobInvoiceReminders)
				.set({
					status: 'completed',
					completed_at: now,
					completed_by: auth.member.id,
					updated_at: now
				})
				.where(
					and(
						eq(jobInvoiceReminders.org_id, auth.orgId),
						eq(jobInvoiceReminders.job_id, id),
						eq(jobInvoiceReminders.status, 'active'),
						isNull(jobInvoiceReminders.deleted_at),
						keepOnCompletionNudge
							? sql`NOT (${jobInvoiceReminders.source} = 'auto' AND ${jobInvoiceReminders.visit_id} IS NULL)`
							: undefined
					)
				);

			await tx.insert(outboxEvents).values({
				org_id: auth.orgId,
				event_type: 'job.completed',
				resource_type: 'job',
				resource_id: updated.id,
				payload: {
					job_id: updated.id,
					org_id: auth.orgId,
					contact_id: updated.contact_id,
					completed_at: updated.completed_at
				},
				// A reopen → complete is a NEW completed lifecycle occurrence. Jobber exposes
				// close/reopen as separate mutations, so a later close must be allowed to emit
				// its own automation event while retries of this exact close remain deduped.
				idempotency_key: `job.completed:${updated.id}:${updated.completed_at!.toISOString()}`
			});
		} else if (action === 'cancel') {
			// Job called off — nothing will ever be invoiced, so complete ALL its reminders
			// (including the on-completion nudge; there's nothing left to prompt).
			await tx
				.update(jobInvoiceReminders)
				.set({
					status: 'completed',
					completed_at: now,
					completed_by: auth.member.id,
					updated_at: now
				})
				.where(
					and(
						eq(jobInvoiceReminders.org_id, auth.orgId),
						eq(jobInvoiceReminders.job_id, id),
						eq(jobInvoiceReminders.status, 'active'),
						isNull(jobInvoiceReminders.deleted_at)
					)
				);

			await tx.insert(outboxEvents).values({
				org_id: auth.orgId,
				event_type: 'job.cancelled',
				resource_type: 'job',
				resource_id: updated.id,
				payload: {
					job_id: updated.id,
					org_id: auth.orgId,
					cancelled_at: updated.cancelled_at
				},
				idempotency_key: `job.cancelled:${updated.id}:${updated.cancelled_at!.toISOString()}`
			});
		}

		return updated;
	});

	if (!result) {
		return json(
			{ error: 'This job was updated by someone else. Refresh and try again.' },
			{ status: 409 }
		);
	}

	return json({ job: result });
};
