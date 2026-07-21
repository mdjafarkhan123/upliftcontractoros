// Multi-assignee sync helpers for invoice reminders.
//
// Mirrors the appointment / calendar-event assignee model:
// `job_invoice_reminders.assigned_to` is the denormalized lead pointer;
// `job_invoice_reminder_assignees` is the source of truth for the full crew.
// Every mutation that touches the crew must call `syncReminderAssignees` *inside*
// the same transaction as the reminder write so the two stay consistent.
//
// The pure/normalization helpers (`resolveAssigneeInput`,
// `validateAssigneesBelongToOrg`) are table-agnostic and reused from the
// appointments module — only the reminder-table-specific writes/reads live here.

import { eq, sql } from 'drizzle-orm';
import type { PgTransaction } from 'drizzle-orm/pg-core';
import { db } from '$lib/server/db/client';
import {
	jobInvoiceReminderAssignees,
	jobInvoiceReminders,
	orgMembers
} from '$lib/server/db/schema';

type DbOrTx = typeof db | PgTransaction<any, any, any>;

// Replaces the full assignee set + syncs job_invoice_reminders.assigned_to. Caller
// must be inside a transaction.
export async function syncReminderAssignees(
	tx: PgTransaction<any, any, any>,
	args: {
		orgId: string;
		reminderId: string;
		assigneeIds: string[];
		leadMemberId: string | null;
	}
): Promise<void> {
	const { orgId, reminderId, assigneeIds, leadMemberId } = args;

	// Replace strategy: delete + insert. Set is small (a crew, not thousands).
	await tx
		.delete(jobInvoiceReminderAssignees)
		.where(eq(jobInvoiceReminderAssignees.reminder_id, reminderId));

	if (assigneeIds.length > 0) {
		await tx.insert(jobInvoiceReminderAssignees).values(
			assigneeIds.map((memberId) => ({
				reminder_id: reminderId,
				member_id: memberId,
				org_id: orgId,
				is_lead: memberId === leadMemberId
			}))
		);
	}

	await tx
		.update(jobInvoiceReminders)
		.set({ assigned_to: leadMemberId, updated_at: new Date() })
		.where(eq(jobInvoiceReminders.id, reminderId));
}

export type ReminderAssigneeRow = { id: string; full_name: string; is_lead: boolean };

export async function loadReminderAssignees(
	exec: DbOrTx,
	reminderId: string
): Promise<ReminderAssigneeRow[]> {
	const rows = await exec
		.select({
			id: orgMembers.id,
			full_name: orgMembers.full_name,
			is_lead: jobInvoiceReminderAssignees.is_lead
		})
		.from(jobInvoiceReminderAssignees)
		.innerJoin(orgMembers, eq(orgMembers.id, jobInvoiceReminderAssignees.member_id))
		.where(eq(jobInvoiceReminderAssignees.reminder_id, reminderId))
		.orderBy(sql`${jobInvoiceReminderAssignees.is_lead} DESC`, orgMembers.full_name);
	return rows;
}
