import { json, error } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { calendarEvents, contacts, orgMembers, type CalendarEvent } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import {
	canRescheduleAppointment,
	canViewAppointment
} from '$lib/server/appointments/permissions';
import { updateEventSchema } from '$lib/server/events/schemas';
import { resolveAssigneeInput, validateAssigneesBelongToOrg } from '$lib/server/appointments/assignees';
import { loadEventAssignees, syncEventAssignees, type EventAssigneeRow } from '$lib/server/events/assignees';

function serialize(
	row: CalendarEvent & { contact_name: string | null; assignee_name: string | null },
	assignees: EventAssigneeRow[]
) {
	return {
		id: row.id,
		contact_id: row.contact_id,
		contact_name: row.contact_name,
		assigned_to: row.assigned_to,
		assignee_name: row.assignee_name,
		assignees,
		title: row.title,
		description: row.description,
		all_day: row.all_day,
		start_at: row.start_at?.toISOString() ?? null,
		end_at: row.end_at?.toISOString() ?? null,
		location: row.location,
		team_reminder_offset_minutes: row.team_reminder_offset_minutes,
		created_at: row.created_at.toISOString(),
		updated_at: row.updated_at.toISOString()
	};
}

async function loadDetail(orgId: string, id: string) {
	const [row] = await db
		.select({
			ev: calendarEvents,
			contact_name: contacts.full_name,
			assignee_name: orgMembers.full_name
		})
		.from(calendarEvents)
		.leftJoin(contacts, eq(contacts.id, calendarEvents.contact_id))
		.leftJoin(orgMembers, eq(orgMembers.id, calendarEvents.assigned_to))
		.where(
			and(eq(calendarEvents.id, id), eq(calendarEvents.org_id, orgId), isNull(calendarEvents.deleted_at))
		)
		.limit(1);
	if (!row) return null;
	return { ...row.ev, contact_name: row.contact_name, assignee_name: row.assignee_name };
}

export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);

	const id = event.params.id!;
	const row = await loadDetail(auth.orgId, id);
	if (!row) error(404, 'Event not found');
	if (!canViewAppointment(auth.member, { assigned_to: row.assigned_to })) {
		error(403, 'Forbidden');
	}

	const assignees = await loadEventAssignees(db, id);
	return json({ data: serialize(row, assignees) });
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

	const parsed = updateEventSchema.safeParse(body);
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

	// Optional client link change — validate ownership if a non-null id is set.
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

	const assigneesProvided =
		input.assignee_ids !== undefined ||
		input.lead_member_id !== undefined ||
		input.assigned_to !== undefined;

	let crew: { assigneeIds: string[]; leadMemberId: string | null } | null = null;
	if (assigneesProvided) {
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
		crew = { assigneeIds: resolution.assigneeIds, leadMemberId: resolution.leadMemberId };
		if (crew.assigneeIds.length > 0) {
			const orgErr = await validateAssigneesBelongToOrg(db, auth.orgId, crew.assigneeIds);
			if (orgErr) {
				return json(
					{ error: orgErr.message, field_errors: { [orgErr.field]: orgErr.message } },
					{ status: 422 }
				);
			}
		}
	}

	const result = await db.transaction(async (tx) => {
		const [existing] = await tx
			.select()
			.from(calendarEvents)
			.where(
				and(
					eq(calendarEvents.id, id),
					eq(calendarEvents.org_id, auth.orgId),
					isNull(calendarEvents.deleted_at)
				)
			)
			.for('update')
			.limit(1);
		if (!existing) return { kind: 'notFound' as const };

		const nextAllDay = input.all_day ?? existing.all_day;

		const updates: Record<string, unknown> = { updated_at: new Date() };
		if (input.contact_id !== undefined) updates.contact_id = input.contact_id;
		if (input.title !== undefined) updates.title = input.title;
		if (input.description !== undefined) updates.description = input.description;
		if (input.all_day !== undefined) updates.all_day = input.all_day;
		if (input.start_at != null) updates.start_at = input.start_at;
		// Becoming all-day clears the end; otherwise honour an explicit end change.
		if (nextAllDay) updates.end_at = null;
		else if (input.end_at !== undefined) updates.end_at = input.end_at;
		if (input.location !== undefined) updates.location = input.location;
		if (input.team_reminder_offset_minutes !== undefined)
			updates.team_reminder_offset_minutes = input.team_reminder_offset_minutes;

		await tx.update(calendarEvents).set(updates).where(eq(calendarEvents.id, id));

		// Sync crew AFTER the main UPDATE so the helper's write to assigned_to wins.
		if (crew) {
			await syncEventAssignees(tx, {
				orgId: auth.orgId,
				eventId: id,
				assigneeIds: crew.assigneeIds,
				leadMemberId: crew.leadMemberId
			});
		}

		return { kind: 'ok' as const };
	});

	if (result.kind === 'notFound') error(404, 'Event not found');

	const detail = await loadDetail(auth.orgId, id);
	if (!detail) error(404, 'Event not found');
	const assignees = await loadEventAssignees(db, id);
	return json({ data: serialize(detail, assignees) });
};

export const DELETE: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canRescheduleAppointment(auth.member)) error(403, 'Forbidden');

	const id = event.params.id!;

	const [row] = await db
		.update(calendarEvents)
		.set({ deleted_at: new Date(), updated_at: new Date() })
		.where(
			and(
				eq(calendarEvents.id, id),
				eq(calendarEvents.org_id, auth.orgId),
				isNull(calendarEvents.deleted_at)
			)
		)
		.returning({ id: calendarEvents.id });

	if (!row) error(404, 'Event not found');
	return new Response(null, { status: 204 });
};
