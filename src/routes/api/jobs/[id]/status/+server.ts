import { json, error } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { jobs, outboxEvents } from '$lib/server/db/schema';
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
			assigned_to: jobs.assigned_to
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

	try {
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

			const [updated] = await tx.update(jobs).set(updates).where(eq(jobs.id, id)).returning();

			if (action === 'complete') {
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
					idempotency_key: `job.completed:${updated.id}`
				});
			} else if (action === 'cancel') {
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
					idempotency_key: `job.cancelled:${updated.id}`
				});
			}

			return updated;
		});

		return json({ job: result });
	} catch (e) {
		const msg = e instanceof Error ? e.message : '';
		// Idempotency_key UNIQUE — a job.completed / job.cancelled was already enqueued for this
		// job (e.g. completed, reopened, completed again). The status change still applied; the
		// duplicate outbox insert is the only conflict, so return the current row.
		if (/unique|duplicate/i.test(msg) && /idempotency/i.test(msg)) {
			const [current] = await db.select().from(jobs).where(eq(jobs.id, id)).limit(1);
			return json({ job: current });
		}
		throw e;
	}
};
