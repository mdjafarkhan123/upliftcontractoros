import { json, error } from '@sveltejs/kit';
import { and, asc, eq, gte, isNull, lt, type SQL } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import {
	appointments,
	contacts,
	jobs,
	orgMembers,
	outboxEvents
} from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import {
	canCreateAppointment,
	canViewAnyAppointment
} from '$lib/server/appointments/permissions';
import { createAppointmentSchema } from '$lib/server/appointments/schemas';
import { hasOverlap } from '$lib/server/appointments/overlap';

const MAX_ROWS = 500;
const VALID_STATUSES = new Set(['scheduled', 'completed', 'cancelled', 'no_show']);

export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canViewAnyAppointment(auth.member)) error(403, 'Forbidden');

	const url = event.url;
	const fromParam = url.searchParams.get('from');
	const toParam = url.searchParams.get('to');
	const statusParam = url.searchParams.get('status');
	const assignedToParam = url.searchParams.get('assigned_to');
	const jobIdParam = url.searchParams.get('job_id');

	if (!fromParam || !toParam) {
		return json({ error: 'from and to query params are required (ISO timestamps).' }, { status: 400 });
	}
	const from = new Date(fromParam);
	const to = new Date(toParam);
	if (isNaN(from.getTime()) || isNaN(to.getTime())) {
		return json({ error: 'Invalid from/to date.' }, { status: 400 });
	}
	if (to.getTime() <= from.getTime()) {
		return json({ error: 'to must be after from.' }, { status: 400 });
	}

	const conditions: SQL[] = [
		eq(appointments.org_id, auth.orgId),
		isNull(appointments.deleted_at),
		gte(appointments.scheduled_start, from),
		lt(appointments.scheduled_start, to)
	];

	if (statusParam && VALID_STATUSES.has(statusParam)) {
		conditions.push(eq(appointments.status, statusParam as 'scheduled'));
	}
	if (assignedToParam) {
		conditions.push(eq(appointments.assigned_to, assignedToParam));
	}
	if (jobIdParam) {
		conditions.push(eq(appointments.job_id, jobIdParam));
	}
	if (!auth.member.can_view_all_appointments) {
		conditions.push(eq(appointments.assigned_to, auth.member.id));
	}

	const rows = await db
		.select({
			id: appointments.id,
			contact_id: appointments.contact_id,
			contact_name: contacts.full_name,
			job_id: appointments.job_id,
			assigned_to: appointments.assigned_to,
			assignee_name: orgMembers.full_name,
			type: appointments.type,
			status: appointments.status,
			title: appointments.title,
			scheduled_start: appointments.scheduled_start,
			scheduled_end: appointments.scheduled_end,
			location: appointments.location,
			booking_source: appointments.booking_source
		})
		.from(appointments)
		.innerJoin(contacts, eq(contacts.id, appointments.contact_id))
		.leftJoin(orgMembers, eq(orgMembers.id, appointments.assigned_to))
		.where(and(...conditions))
		.orderBy(asc(appointments.scheduled_start), asc(appointments.id))
		.limit(MAX_ROWS);

	const items = rows.map((r) => ({
		...r,
		scheduled_start: r.scheduled_start.toISOString(),
		scheduled_end: r.scheduled_end?.toISOString() ?? null
	}));

	return json({ items });
};

export const POST: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canCreateAppointment(auth.member)) error(403, 'Forbidden');

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const parsed = createAppointmentSchema.safeParse(body);
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

	const [contactRow] = await db
		.select({ id: contacts.id })
		.from(contacts)
		.where(
			and(
				eq(contacts.id, input.contact_id),
				eq(contacts.org_id, auth.orgId),
				isNull(contacts.deleted_at)
			)
		)
		.limit(1);
	if (!contactRow) return json({ error: 'Contact not found' }, { status: 422 });

	let jobLocation: string | null = null;
	if (input.job_id) {
		const [jobRow] = await db
			.select({
				id: jobs.id,
				contact_id: jobs.contact_id,
				service_address_line_1: jobs.service_address_line_1,
				service_address_line_2: jobs.service_address_line_2,
				service_address_city: jobs.service_address_city,
				service_address_state: jobs.service_address_state,
				service_address_zip: jobs.service_address_zip
			})
			.from(jobs)
			.where(
				and(
					eq(jobs.id, input.job_id),
					eq(jobs.org_id, auth.orgId),
					isNull(jobs.deleted_at)
				)
			)
			.limit(1);
		if (!jobRow) return json({ error: 'Job not found' }, { status: 422 });
		if (jobRow.contact_id !== input.contact_id) {
			return json({ error: 'Job does not belong to selected contact.' }, { status: 422 });
		}
		const addrParts = [
			jobRow.service_address_line_1,
			jobRow.service_address_line_2,
			[jobRow.service_address_city, jobRow.service_address_state, jobRow.service_address_zip]
				.filter(Boolean)
				.join(', ')
		].filter(Boolean);
		jobLocation = addrParts.length > 0 ? addrParts.join(' · ') : null;
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
			return json({ error: 'Assignee is not an active member.' }, { status: 422 });
		}

		const conflict = await hasOverlap(db, {
			orgId: auth.orgId,
			assignedTo: input.assigned_to,
			start: input.scheduled_start,
			end: input.scheduled_end
		});
		if (conflict) {
			return json({ error: 'Time conflict' }, { status: 409 });
		}
	}

	const created = await db.transaction(async (tx) => {
		const [inserted] = await tx
			.insert(appointments)
			.values({
				org_id: auth.orgId,
				contact_id: input.contact_id,
				job_id: input.job_id ?? null,
				assigned_to: input.assigned_to ?? null,
				type: input.type,
				status: 'scheduled',
				title: input.title,
				scheduled_start: input.scheduled_start,
				scheduled_end: input.scheduled_end,
				location: input.location ?? jobLocation,
				notes: input.notes ?? null
			})
			.returning();

		await tx.insert(outboxEvents).values({
			org_id: auth.orgId,
			event_type: 'appointment.created',
			resource_type: 'appointment',
			resource_id: inserted.id,
			payload: {
				appointment_id: inserted.id,
				org_id: auth.orgId,
				contact_id: inserted.contact_id,
				job_id: inserted.job_id,
				assigned_to: inserted.assigned_to,
				scheduled_start: inserted.scheduled_start.toISOString(),
				scheduled_end: inserted.scheduled_end?.toISOString() ?? null
			},
			idempotency_key: `appointment.created:${inserted.id}`
		});

		return inserted;
	});

	return json({ data: { id: created.id } }, { status: 201 });
};
