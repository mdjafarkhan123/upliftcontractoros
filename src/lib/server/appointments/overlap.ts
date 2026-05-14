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
