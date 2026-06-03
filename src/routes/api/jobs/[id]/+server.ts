import { json, error } from '@sveltejs/kit';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import {
	appointments,
	contacts,
	invoices,
	jobs,
	orgMembers,
	outboxEvents,
	reviewRequests
} from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canEditJob, canViewJob } from '$lib/server/jobs/permissions';
import { updateJobSchema } from '$lib/server/jobs/schemas';

export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);

	const id = event.params.id!;
	const [row] = await db
		.select({
			id: jobs.id,
			title: jobs.title,
			status: jobs.status,
			contact_id: jobs.contact_id,
			contact_name: contacts.full_name,
			contact_phone: contacts.phone,
			contact_email: contacts.email,
			opportunity_id: jobs.opportunity_id,
			source: jobs.source,
			assigned_to: jobs.assigned_to,
			assignee_name: orgMembers.full_name,
			notes: jobs.notes,
			scope_of_work: jobs.scope_of_work,
			service_address_line_1: jobs.service_address_line_1,
			service_address_line_2: jobs.service_address_line_2,
			service_address_city: jobs.service_address_city,
			service_address_state: jobs.service_address_state,
			service_address_zip: jobs.service_address_zip,
			scheduled_start: jobs.scheduled_start,
			scheduled_end: jobs.scheduled_end,
			completed_at: jobs.completed_at,
			cancelled_at: jobs.cancelled_at,
			created_at: jobs.created_at,
			updated_at: jobs.updated_at
		})
		.from(jobs)
		.innerJoin(contacts, eq(contacts.id, jobs.contact_id))
		.leftJoin(orgMembers, eq(orgMembers.id, jobs.assigned_to))
		.where(and(eq(jobs.id, id), eq(jobs.org_id, auth.orgId), isNull(jobs.deleted_at)))
		.limit(1);

	if (!row) error(404, 'Job not found');
	if (!canViewJob(auth.member, { assigned_to: row.assigned_to })) {
		error(403, 'Forbidden');
	}

	const [invoiceCountRow] = await db
		.select({ c: sql<number>`count(*)::int` })
		.from(invoices)
		.where(
			and(eq(invoices.job_id, id), eq(invoices.org_id, auth.orgId), isNull(invoices.deleted_at))
		);

	const [appointmentCountRow] = await db
		.select({ c: sql<number>`count(*)::int` })
		.from(appointments)
		.where(
			and(
				eq(appointments.job_id, id),
				eq(appointments.org_id, auth.orgId),
				isNull(appointments.deleted_at)
			)
		);

	const [rr] = await db
		.select({ status: reviewRequests.status })
		.from(reviewRequests)
		.where(
			and(
				eq(reviewRequests.job_id, id),
				eq(reviewRequests.org_id, auth.orgId),
				isNull(reviewRequests.deleted_at)
			)
		)
		.limit(1);

	return json({
		job: {
			...row,
			invoice_count: invoiceCountRow?.c ?? 0,
			appointment_count: appointmentCountRow?.c ?? 0,
			review_request_status: rr?.status ?? null
		}
	});
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

	const parsed = updateJobSchema.safeParse(body);
	if (!parsed.success) {
		return json(
			{ error: parsed.error.issues[0]?.message ?? 'Invalid input', code: 'VALIDATION_ERROR' },
			{ status: 422 }
		);
	}
	const input = parsed.data;

	const [existing] = await db
		.select({
			id: jobs.id,
			assigned_to: jobs.assigned_to,
			status: jobs.status
		})
		.from(jobs)
		.where(and(eq(jobs.id, id), eq(jobs.org_id, auth.orgId), isNull(jobs.deleted_at)))
		.limit(1);
	if (!existing) error(404, 'Job not found');

	if (!canEditJob(auth.member, { assigned_to: existing.assigned_to })) {
		error(403, 'Forbidden');
	}

	if (existing.status === 'completed' || existing.status === 'cancelled') {
		return json({ error: 'Cannot edit a closed job.', code: 'JOB_CLOSED' }, { status: 422 });
	}

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
			return json(
				{ error: 'Assignee is not an active member.', code: 'INVALID_ASSIGNEE' },
				{ status: 422 }
			);
		}
	}

	const updates: Record<string, unknown> = { updated_at: new Date() };
	if (input.assigned_to !== undefined) updates.assigned_to = input.assigned_to;
	if (input.scheduled_start !== undefined) updates.scheduled_start = input.scheduled_start;
	if (input.scheduled_end !== undefined) updates.scheduled_end = input.scheduled_end;
	if (input.notes !== undefined) updates.notes = input.notes;
	if (input.scope_of_work !== undefined) updates.scope_of_work = input.scope_of_work;

	const assigneeChanged =
		input.assigned_to !== undefined && input.assigned_to !== existing.assigned_to;

	const result = await db.transaction(async (tx) => {
		const [updated] = await tx.update(jobs).set(updates).where(eq(jobs.id, id)).returning();

		if (assigneeChanged) {
			await tx.insert(outboxEvents).values({
				org_id: auth.orgId,
				event_type: 'job.assigned',
				resource_type: 'job',
				resource_id: updated.id,
				payload: {
					job_id: updated.id,
					org_id: auth.orgId,
					from_assigned_to: existing.assigned_to,
					to_assigned_to: updated.assigned_to
				},
				idempotency_key: `job.assigned:${updated.id}:${updated.assigned_to ?? 'null'}`
			});
		}

		return updated;
	});

	return json({ job: result });
};
