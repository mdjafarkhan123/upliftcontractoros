// Multi-assignee sync helpers for appointments.
//
// `appointments.assigned_to` is the denormalized lead pointer. Source of truth
// is `appointment_assignees`. Every mutation that touches the crew must call
// `syncAppointmentAssignees` *inside* the same transaction as the appointment
// write so the two stay consistent.

import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { PgTransaction } from 'drizzle-orm/pg-core';
import { db } from '$lib/server/db/client';
import { appointmentAssignees, appointments, orgMembers } from '$lib/server/db/schema';

type DbOrTx = typeof db | PgTransaction<any, any, any>;

export type AssigneeResolution = {
	assigneeIds: string[];
	leadMemberId: string | null;
};

export type ResolveError = { field: string; message: string };

// Normalize input from the API layer. Dedupes and resolves a default lead.
// Does NOT hit the DB — pure transformation. Validation against org membership
// happens in `validateAssigneesBelongToOrg`.
export function resolveAssigneeInput(input: {
	assignee_ids?: string[] | null;
	lead_member_id?: string | null;
	// Backwards-compat: legacy single-assignee callers.
	assigned_to?: string | null;
}): AssigneeResolution | ResolveError {
	let ids: string[];
	let lead: string | null;

	if (input.assignee_ids !== undefined && input.assignee_ids !== null) {
		ids = Array.from(new Set(input.assignee_ids));
		lead = input.lead_member_id ?? null;
	} else if (input.assigned_to !== undefined) {
		// Legacy shape: assigned_to => single crew member, that member is lead.
		ids = input.assigned_to ? [input.assigned_to] : [];
		lead = input.assigned_to ?? null;
	} else {
		// Field not present in payload — caller wants "no change". Surface as
		// undefined sentinel via empty resolution; the caller decides what to do.
		return { assigneeIds: [], leadMemberId: null };
	}

	if (ids.length === 0) {
		return { assigneeIds: [], leadMemberId: null };
	}

	if (lead && !ids.includes(lead)) {
		return { field: 'lead_member_id', message: 'Lead must be one of the assignees.' };
	}

	if (!lead) lead = ids[0]!;
	return { assigneeIds: ids, leadMemberId: lead };
}

export async function validateAssigneesBelongToOrg(
	exec: DbOrTx,
	orgId: string,
	memberIds: string[]
): Promise<ResolveError | null> {
	if (memberIds.length === 0) return null;
	const rows = await exec
		.select({ id: orgMembers.id })
		.from(orgMembers)
		.where(
			and(
				inArray(orgMembers.id, memberIds),
				eq(orgMembers.org_id, orgId),
				eq(orgMembers.is_active, true),
				isNull(orgMembers.deleted_at)
			)
		);
	if (rows.length !== memberIds.length) {
		return { field: 'assignee_ids', message: 'One or more assignees are not active org members.' };
	}
	return null;
}

// Replaces the full assignee set + syncs appointments.assigned_to. Caller
// must be inside a transaction.
export async function syncAppointmentAssignees(
	tx: PgTransaction<any, any, any>,
	args: {
		orgId: string;
		appointmentId: string;
		assigneeIds: string[];
		leadMemberId: string | null;
	}
): Promise<void> {
	const { orgId, appointmentId, assigneeIds, leadMemberId } = args;

	// Replace strategy: delete + insert. Set is small (a crew, not thousands).
	await tx
		.delete(appointmentAssignees)
		.where(eq(appointmentAssignees.appointment_id, appointmentId));

	if (assigneeIds.length > 0) {
		await tx.insert(appointmentAssignees).values(
			assigneeIds.map((memberId) => ({
				appointment_id: appointmentId,
				member_id: memberId,
				org_id: orgId,
				is_lead: memberId === leadMemberId
			}))
		);
	}

	await tx
		.update(appointments)
		.set({ assigned_to: leadMemberId, updated_at: new Date() })
		.where(eq(appointments.id, appointmentId));
}

export type AssigneeRow = { id: string; full_name: string; is_lead: boolean };

export async function loadAssignees(exec: DbOrTx, appointmentId: string): Promise<AssigneeRow[]> {
	const rows = await exec
		.select({
			id: orgMembers.id,
			full_name: orgMembers.full_name,
			is_lead: appointmentAssignees.is_lead
		})
		.from(appointmentAssignees)
		.innerJoin(orgMembers, eq(orgMembers.id, appointmentAssignees.member_id))
		.where(eq(appointmentAssignees.appointment_id, appointmentId))
		.orderBy(sql`${appointmentAssignees.is_lead} DESC`, orgMembers.full_name);
	return rows;
}

// Fan-out helper for notifications: all assignees for an appointment.
export async function loadAssigneeMemberIds(
	exec: DbOrTx,
	appointmentId: string
): Promise<string[]> {
	const rows = await exec
		.select({ id: appointmentAssignees.member_id })
		.from(appointmentAssignees)
		.where(eq(appointmentAssignees.appointment_id, appointmentId));
	return rows.map((r) => r.id);
}

// Called when an org member is removed/deactivated and we want to drop them
// off appointments. If they were lead, promote the next assignee by created_at.
// Returns appointmentIds where assigned_to was changed (caller may want to
// emit audit events).
export async function removeMemberFromAllAppointments(
	tx: PgTransaction<any, any, any>,
	orgId: string,
	memberId: string
): Promise<string[]> {
	const affected = await tx
		.select({
			appointment_id: appointmentAssignees.appointment_id,
			is_lead: appointmentAssignees.is_lead
		})
		.from(appointmentAssignees)
		.where(
			and(eq(appointmentAssignees.member_id, memberId), eq(appointmentAssignees.org_id, orgId))
		);

	if (affected.length === 0) return [];

	await tx
		.delete(appointmentAssignees)
		.where(
			and(eq(appointmentAssignees.member_id, memberId), eq(appointmentAssignees.org_id, orgId))
		);

	const leadAppts = affected.filter((r) => r.is_lead).map((r) => r.appointment_id);
	const changed: string[] = [];

	for (const appointmentId of leadAppts) {
		// Promote next assignee by created_at ASC; fall back to NULL if none.
		const [next] = await tx
			.select({ member_id: appointmentAssignees.member_id })
			.from(appointmentAssignees)
			.where(eq(appointmentAssignees.appointment_id, appointmentId))
			.orderBy(appointmentAssignees.created_at)
			.limit(1);

		const newLeadId = next?.member_id ?? null;
		if (newLeadId) {
			await tx
				.update(appointmentAssignees)
				.set({ is_lead: true })
				.where(
					and(
						eq(appointmentAssignees.appointment_id, appointmentId),
						eq(appointmentAssignees.member_id, newLeadId)
					)
				);
		}

		await tx
			.update(appointments)
			.set({ assigned_to: newLeadId, updated_at: new Date() })
			.where(eq(appointments.id, appointmentId));

		changed.push(appointmentId);
	}

	return changed;
}
