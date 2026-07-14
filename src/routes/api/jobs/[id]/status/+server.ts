import { json, error } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { jobs, outboxEvents } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canCancelJob, canEditJob } from '$lib/server/jobs/permissions';
import { transitionStatusSchema } from '$lib/server/jobs/schemas';
import type { JobStatus } from '$lib/types/jobs';

const ALLOWED: Record<JobStatus, JobStatus[]> = {
	// On hold = a temporary pause; resuming returns the job to 'scheduled' (it re-enters the
	// normal queue as Pending/Scheduled, and Start becomes available again).
	scheduled: ['in_progress', 'on_hold', 'completed', 'cancelled'],
	in_progress: ['on_hold', 'completed', 'cancelled'],
	on_hold: ['scheduled', 'cancelled'],
	completed: [],
	cancelled: []
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
	const next = parsed.data.status;

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
	if (next === 'cancelled' && !canCancelJob(auth.member)) {
		error(403, 'Forbidden');
	}

	if (existing.status === next) {
		return json({ job: existing });
	}

	if (!ALLOWED[existing.status].includes(next)) {
		return json(
			{
				error: `Cannot transition from ${existing.status} to ${next}.`,
				code: 'INVALID_TRANSITION'
			},
			{ status: 422 }
		);
	}

	try {
		const result = await db.transaction(async (tx) => {
			const now = new Date();
			const updates: Record<string, unknown> = { status: next, updated_at: now };
			if (next === 'completed') updates.completed_at = now;
			if (next === 'cancelled') updates.cancelled_at = now;

			const [updated] = await tx.update(jobs).set(updates).where(eq(jobs.id, id)).returning();

			if (next === 'completed') {
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
			} else if (next === 'cancelled') {
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
		// Idempotency_key UNIQUE — duplicate dispatch attempt; return current row
		if (/unique|duplicate/i.test(msg) && /idempotency/i.test(msg)) {
			const [current] = await db.select().from(jobs).where(eq(jobs.id, id)).limit(1);
			return json({ job: current });
		}
		throw e;
	}
};
