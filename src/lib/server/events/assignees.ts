// Multi-assignee sync helpers for calendar events.
//
// Mirrors the appointment assignee model: `calendar_events.assigned_to` is the
// denormalized lead pointer; `calendar_event_assignees` is the source of truth
// for the full crew. Every mutation that touches the crew must call
// `syncEventAssignees` *inside* the same transaction as the event write.
//
// The pure/normalization helpers (`resolveAssigneeInput`,
// `validateAssigneesBelongToOrg`) are table-agnostic and reused from the
// appointments module — only the event-table-specific writes/reads live here.

import { and, eq, sql } from 'drizzle-orm';
import type { PgTransaction } from 'drizzle-orm/pg-core';
import { db } from '$lib/server/db/client';
import { calendarEventAssignees, calendarEvents, orgMembers } from '$lib/server/db/schema';

type DbOrTx = typeof db | PgTransaction<any, any, any>;

// Replaces the full assignee set + syncs calendar_events.assigned_to. Caller
// must be inside a transaction.
export async function syncEventAssignees(
	tx: PgTransaction<any, any, any>,
	args: {
		orgId: string;
		eventId: string;
		assigneeIds: string[];
		leadMemberId: string | null;
	}
): Promise<void> {
	const { orgId, eventId, assigneeIds, leadMemberId } = args;

	// Replace strategy: delete + insert. Set is small (a crew, not thousands).
	await tx.delete(calendarEventAssignees).where(eq(calendarEventAssignees.event_id, eventId));

	if (assigneeIds.length > 0) {
		await tx.insert(calendarEventAssignees).values(
			assigneeIds.map((memberId) => ({
				event_id: eventId,
				member_id: memberId,
				org_id: orgId,
				is_lead: memberId === leadMemberId
			}))
		);
	}

	await tx
		.update(calendarEvents)
		.set({ assigned_to: leadMemberId, updated_at: new Date() })
		.where(eq(calendarEvents.id, eventId));
}

export type EventAssigneeRow = { id: string; full_name: string; is_lead: boolean };

export async function loadEventAssignees(
	exec: DbOrTx,
	eventId: string
): Promise<EventAssigneeRow[]> {
	const rows = await exec
		.select({
			id: orgMembers.id,
			full_name: orgMembers.full_name,
			is_lead: calendarEventAssignees.is_lead
		})
		.from(calendarEventAssignees)
		.innerJoin(orgMembers, eq(orgMembers.id, calendarEventAssignees.member_id))
		.where(eq(calendarEventAssignees.event_id, eventId))
		.orderBy(sql`${calendarEventAssignees.is_lead} DESC`, orgMembers.full_name);
	return rows;
}

// Called when an org member is removed/deactivated: drop them off events and, if
// they were lead, promote the next assignee by created_at (fall back to NULL).
// Returns eventIds whose assigned_to changed. Mirrors
// `removeMemberFromAllAppointments`.
export async function removeMemberFromAllEvents(
	tx: PgTransaction<any, any, any>,
	orgId: string,
	memberId: string
): Promise<string[]> {
	const affected = await tx
		.select({
			event_id: calendarEventAssignees.event_id,
			is_lead: calendarEventAssignees.is_lead
		})
		.from(calendarEventAssignees)
		.where(
			and(eq(calendarEventAssignees.member_id, memberId), eq(calendarEventAssignees.org_id, orgId))
		);

	if (affected.length === 0) return [];

	await tx
		.delete(calendarEventAssignees)
		.where(
			and(eq(calendarEventAssignees.member_id, memberId), eq(calendarEventAssignees.org_id, orgId))
		);

	const leadEvents = affected.filter((r) => r.is_lead).map((r) => r.event_id);
	const changed: string[] = [];

	for (const eventId of leadEvents) {
		const [next] = await tx
			.select({ member_id: calendarEventAssignees.member_id })
			.from(calendarEventAssignees)
			.where(eq(calendarEventAssignees.event_id, eventId))
			.orderBy(calendarEventAssignees.created_at)
			.limit(1);

		const newLeadId = next?.member_id ?? null;
		if (newLeadId) {
			await tx
				.update(calendarEventAssignees)
				.set({ is_lead: true })
				.where(
					and(
						eq(calendarEventAssignees.event_id, eventId),
						eq(calendarEventAssignees.member_id, newLeadId)
					)
				);
		}

		await tx
			.update(calendarEvents)
			.set({ assigned_to: newLeadId, updated_at: new Date() })
			.where(eq(calendarEvents.id, eventId));

		changed.push(eventId);
	}

	return changed;
}
