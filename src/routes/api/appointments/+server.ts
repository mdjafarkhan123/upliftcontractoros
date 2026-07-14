import { json, error } from '@sveltejs/kit';
import { and, asc, eq, gte, isNotNull, isNull, lt, sql, type SQL } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { appointments, contacts, jobs, orgMembers, outboxEvents } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canCreateAppointment, canViewAnyAppointment } from '$lib/server/appointments/permissions';
import { createAppointmentSchema } from '$lib/server/appointments/schemas';
import { findConflictingAssignee } from '$lib/server/appointments/overlap';
import {
	resolveAssigneeInput,
	syncAppointmentAssignees,
	validateAssigneesBelongToOrg
} from '$lib/server/appointments/assignees';
import { textMatch } from '$lib/server/search/textSearch';
import { repinOneOffJobSchedule } from '$lib/server/jobs/repinSchedule';

const MAX_ROWS = 500;
// Search runs across *all* dates (not the calendar window), so it caps lower
// than the windowed list to stay snappy. Filter-only: no relevance reorder.
const SEARCH_MAX_ROWS = 100;
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
	const searchRaw = (url.searchParams.get('q') ?? '').trim();
	const isSearching = searchRaw.length > 0;

	const conditions: SQL[] = [
		eq(appointments.org_id, auth.orgId),
		isNull(appointments.deleted_at),
		// Unscheduled visits (Jobber "Schedule later") have no date — they belong only in the
		// job's Visits list, never on the calendar or in calendar search. Excluding them here
		// also keeps the search branch (which has no from/to window) null-safe.
		isNotNull(appointments.scheduled_start)
	];

	// When searching, query across ALL dates (the user is hunting by name/title,
	// not browsing a week) — so from/to are ignored. Otherwise they are required
	// and bound the calendar window as before.
	if (isSearching) {
		// Fuzzy match over the appointment title + location + the linked contact's
		// name/company. Indexed by 0081 (title/location) and 0079 (contacts.*).
		conditions.push(
			textMatch(searchRaw, [
				appointments.title,
				appointments.location,
				contacts.full_name,
				contacts.company_name
			])
		);
	} else {
		if (!fromParam || !toParam) {
			return json(
				{ error: 'from and to query params are required (ISO timestamps).' },
				{ status: 400 }
			);
		}
		const from = new Date(fromParam);
		const to = new Date(toParam);
		if (isNaN(from.getTime()) || isNaN(to.getTime())) {
			return json({ error: 'Invalid from/to date.' }, { status: 400 });
		}
		if (to.getTime() <= from.getTime()) {
			return json({ error: 'to must be after from.' }, { status: 400 });
		}
		conditions.push(gte(appointments.scheduled_start, from), lt(appointments.scheduled_start, to));
	}

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
			contact_phone: contacts.phone,
			contact_email: contacts.email,
			job_id: appointments.job_id,
			assigned_to: appointments.assigned_to,
			assignee_name: orgMembers.full_name,
			assignee_count: sql<number>`(
				SELECT COUNT(*)::int FROM appointment_assignees aa
				WHERE aa.appointment_id = ${appointments.id}
			)`,
			type: appointments.type,
			status: appointments.status,
			title: appointments.title,
			scheduled_start: appointments.scheduled_start,
			scheduled_end: appointments.scheduled_end,
			all_day: appointments.all_day,
			location: appointments.location,
			booking_source: appointments.booking_source
		})
		.from(appointments)
		.innerJoin(contacts, eq(contacts.id, appointments.contact_id))
		.leftJoin(orgMembers, eq(orgMembers.id, appointments.assigned_to))
		.where(and(...conditions))
		// Search: nearest-in-time first — upcoming before past, then closest to
		// now (filter-only, no relevance reorder). Calendar: plain chronological.
		.orderBy(
			...(isSearching
				? [
						sql`(${appointments.scheduled_start} < now())`,
						sql`abs(extract(epoch from (${appointments.scheduled_start} - now())))`,
						asc(appointments.id)
					]
				: [asc(appointments.scheduled_start), asc(appointments.id)])
		)
		.limit(isSearching ? SEARCH_MAX_ROWS : MAX_ROWS);

	const items = rows.map((r) => ({
		...r,
		// Non-null: the query filters out unscheduled visits (scheduled_start IS NOT NULL).
		scheduled_start: r.scheduled_start!.toISOString(),
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
			.where(and(eq(jobs.id, input.job_id), eq(jobs.org_id, auth.orgId), isNull(jobs.deleted_at)))
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
	const { assigneeIds, leadMemberId } = resolution;

	if (assigneeIds.length > 0) {
		const orgErr = await validateAssigneesBelongToOrg(db, auth.orgId, assigneeIds);
		if (orgErr) {
			return json(
				{ error: orgErr.message, field_errors: { [orgErr.field]: orgErr.message } },
				{ status: 422 }
			);
		}

		// "Anytime" visits have no clock time, and unscheduled visits have no date at all,
		// so neither can time-conflict with anyone.
		if (!input.all_day && input.scheduled_start && input.scheduled_end) {
			const conflictMember = await findConflictingAssignee(db, {
				orgId: auth.orgId,
				assigneeIds,
				start: input.scheduled_start,
				end: input.scheduled_end
			});
			if (conflictMember) {
				return json({ error: 'Time conflict' }, { status: 409 });
			}
		}
	}

	const created = await db.transaction(async (tx) => {
		const [inserted] = await tx
			.insert(appointments)
			.values({
				org_id: auth.orgId,
				contact_id: input.contact_id,
				job_id: input.job_id ?? null,
				assigned_to: leadMemberId,
				type: input.type,
				// No date ⇒ a "Schedule later" placeholder; a date ⇒ a live scheduled visit.
				status: input.scheduled_start ? 'scheduled' : 'unscheduled',
				title: input.title,
				all_day: input.all_day,
				scheduled_start: input.scheduled_start ?? null,
				// Anytime and unscheduled visits carry no end time.
				scheduled_end: input.all_day || !input.scheduled_start ? null : input.scheduled_end,
				location: input.location ?? jobLocation,
				notes: input.notes ?? null
			})
			.returning();

		if (assigneeIds.length > 0) {
			await syncAppointmentAssignees(tx, {
				orgId: auth.orgId,
				appointmentId: inserted.id,
				assigneeIds,
				leadMemberId
			});
		}

		// Keep the parent one-off job's schedule copy in lockstep: a newly added dated visit must
		// re-point the job to its earliest open visit, so the job badge + "Schedule later" toggle
		// can't read "Unscheduled" while a visit sits on the calendar. No-op for recurring jobs.
		if (inserted.job_id) {
			await repinOneOffJobSchedule(tx, { orgId: auth.orgId, jobId: inserted.job_id });
		}

		// An unscheduled placeholder has no date to anchor reminders/automations to, so it emits
		// NO appointment.created (matching the job-create "Schedule later" path). It flows into
		// the reminder engine later, when a date is added and it's promoted to 'scheduled'.
		if (inserted.scheduled_start) {
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
					assigned_to: leadMemberId,
					assignee_ids: assigneeIds,
					scheduled_start: inserted.scheduled_start.toISOString(),
					scheduled_end: inserted.scheduled_end?.toISOString() ?? null
				},
				idempotency_key: `appointment.created:${inserted.id}`
			});
		}

		return inserted;
	});

	return json({ data: { id: created.id } }, { status: 201 });
};
