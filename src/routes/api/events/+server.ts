import { json, error } from '@sveltejs/kit';
import { and, asc, eq, gte, isNull, lt, sql, type SQL } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { calendarEvents, contacts, orgMembers } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canCreateAppointment, canViewAnyAppointment } from '$lib/server/appointments/permissions';
import { createEventSchema } from '$lib/server/events/schemas';
import {
	resolveAssigneeInput,
	validateAssigneesBelongToOrg
} from '$lib/server/appointments/assignees';
import { syncEventAssignees } from '$lib/server/events/assignees';

const MAX_ROWS = 500;

// GET /api/events?from=ISO&to=ISO[&assigned_to=memberId]
// Returns calendar events whose start falls inside the [from, to) window.
// (Follows Jobber: events are non-billable, customer-optional time blocks that
// share the calendar grid with visits.)
export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canViewAnyAppointment(auth.member)) error(403, 'Forbidden');

	const url = event.url;
	const fromParam = url.searchParams.get('from');
	const toParam = url.searchParams.get('to');
	const assignedToParam = url.searchParams.get('assigned_to');

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
		eq(calendarEvents.org_id, auth.orgId),
		isNull(calendarEvents.deleted_at),
		gte(calendarEvents.start_at, from),
		lt(calendarEvents.start_at, to)
	];

	if (assignedToParam) {
		conditions.push(eq(calendarEvents.assigned_to, assignedToParam));
	}
	// Restricted-view members only see events they're the lead on.
	if (!auth.member.can_view_all_appointments) {
		conditions.push(eq(calendarEvents.assigned_to, auth.member.id));
	}

	const rows = await db
		.select({
			id: calendarEvents.id,
			contact_id: calendarEvents.contact_id,
			contact_name: contacts.full_name,
			assigned_to: calendarEvents.assigned_to,
			assignee_name: orgMembers.full_name,
			assignee_count: sql<number>`(
				SELECT COUNT(*)::int FROM calendar_event_assignees ea
				WHERE ea.event_id = ${calendarEvents.id}
			)`,
			title: calendarEvents.title,
			description: calendarEvents.description,
			start_at: calendarEvents.start_at,
			end_at: calendarEvents.end_at,
			all_day: calendarEvents.all_day,
			location: calendarEvents.location
		})
		.from(calendarEvents)
		.leftJoin(contacts, eq(contacts.id, calendarEvents.contact_id))
		.leftJoin(orgMembers, eq(orgMembers.id, calendarEvents.assigned_to))
		.where(and(...conditions))
		.orderBy(asc(calendarEvents.start_at), asc(calendarEvents.id))
		.limit(MAX_ROWS);

	const items = rows.map((r) => ({
		...r,
		start_at: r.start_at?.toISOString() ?? null,
		end_at: r.end_at?.toISOString() ?? null
	}));

	return json({ items });
};

// POST /api/events — create a calendar event (customer optional, no billing,
// no hard time-conflict block — Jobber treats events as busy-visual, not a lock).
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

	const parsed = createEventSchema.safeParse(body);
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

	// Optional client link — validate it belongs to the org if provided.
	if (input.contact_id) {
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
	}

	const created = await db.transaction(async (tx) => {
		const [inserted] = await tx
			.insert(calendarEvents)
			.values({
				org_id: auth.orgId,
				contact_id: input.contact_id ?? null,
				assigned_to: leadMemberId,
				title: input.title,
				description: input.description ?? null,
				all_day: input.all_day,
				start_at: input.start_at,
				// All-day events carry no end time.
				end_at: input.all_day ? null : (input.end_at ?? null),
				location: input.location ?? null,
				team_reminder_offset_minutes: input.team_reminder_offset_minutes ?? null,
				created_by: auth.member.id
			})
			.returning();

		if (assigneeIds.length > 0) {
			await syncEventAssignees(tx, {
				orgId: auth.orgId,
				eventId: inserted.id,
				assigneeIds,
				leadMemberId
			});
		}

		return inserted;
	});

	return json({ data: { id: created.id } }, { status: 201 });
};
