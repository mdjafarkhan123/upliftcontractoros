import { sql } from 'drizzle-orm';
import type { PgTransaction } from 'drizzle-orm/pg-core';
import { db } from '$lib/server/db/client';

type DbOrTx = typeof db | PgTransaction<any, any, any>;

export async function hasOverlap(
	exec: DbOrTx,
	args: {
		orgId: string;
		assignedTo: string;
		start: Date;
		end: Date;
		excludeId?: string;
	}
): Promise<boolean> {
	const { orgId, assignedTo, start, end, excludeId } = args;
	const rows = await exec.execute<{ id: string }>(sql`
		SELECT id FROM appointments
		WHERE org_id = ${orgId}
			AND assigned_to = ${assignedTo}
			AND status = 'scheduled'
			AND deleted_at IS NULL
			AND scheduled_end IS NOT NULL
			AND tstzrange(scheduled_start, scheduled_end, '[)')
				&& tstzrange(${start.toISOString()}::timestamptz, ${end.toISOString()}::timestamptz, '[)')
			${excludeId ? sql`AND id <> ${excludeId}` : sql``}
		LIMIT 1
	`);
	return (rows as unknown as { id: string }[]).length > 0;
}

// Multi-assignee variant. Returns the first member_id that has a conflicting
// appointment in the requested window. NULL = clear schedule.
export async function findConflictingAssignee(
	exec: DbOrTx,
	args: {
		orgId: string;
		assigneeIds: string[];
		start: Date;
		end: Date;
		excludeId?: string;
	}
): Promise<string | null> {
	const { orgId, assigneeIds, start, end, excludeId } = args;
	if (assigneeIds.length === 0) return null;
	// Build the uuid[] the way the rest of the codebase does (see contactRepo) —
	// an explicit ARRAY[...]::uuid[] literal. Interpolating a JS array straight into
	// `ANY(${arr}::uuid[])` mis-binds under postgres.js and throws at query time.
	const idArray = sql`ARRAY[${sql.join(
		assigneeIds.map((id) => sql`${id}`),
		sql`, `
	)}]::uuid[]`;
	const rows = await exec.execute<{ member_id: string }>(sql`
		SELECT aa.member_id
		FROM appointment_assignees aa
		INNER JOIN appointments a ON a.id = aa.appointment_id
		WHERE aa.org_id = ${orgId}
			AND aa.member_id = ANY(${idArray})
			AND a.status = 'scheduled'
			AND a.deleted_at IS NULL
			AND a.scheduled_end IS NOT NULL
			AND tstzrange(a.scheduled_start, a.scheduled_end, '[)')
				&& tstzrange(${start.toISOString()}::timestamptz, ${end.toISOString()}::timestamptz, '[)')
			${excludeId ? sql`AND a.id <> ${excludeId}` : sql``}
		LIMIT 1
	`);
	const arr = rows as unknown as { member_id: string }[];
	return arr.length > 0 ? arr[0]!.member_id : null;
}
