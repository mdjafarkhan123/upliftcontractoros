import { json } from '@sveltejs/kit';
import { and, eq, sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { contacts } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';

// Counts for the contact list tab badges (Archived, Recycle Bin). Restricted
// members (no can_view_all_contacts) see counts scoped to contacts assigned to
// them — the same boundary as the list itself.
export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);

	const filters = [
		eq(contacts.org_id, auth.orgId),
		sql`(${contacts.phone} IS NULL OR ${contacts.phone} NOT LIKE 'RELEASED:%')`
	];
	if (!auth.member.can_view_all_contacts) {
		filters.push(eq(contacts.assigned_to, auth.member.id));
	}

	const [row] = await db
		.select({
			leads: sql<number>`COUNT(*) FILTER (WHERE ${contacts.status} = 'lead' AND ${contacts.deleted_at} IS NULL)::int`,
			customers: sql<number>`COUNT(*) FILTER (WHERE ${contacts.status} = 'customer' AND ${contacts.deleted_at} IS NULL)::int`,
			// Past-due follow-ups across the active list (leads + customers, never
			// archived/deleted) — the "act today" number the strip leads with.
			needs_follow_up: sql<number>`COUNT(*) FILTER (WHERE ${contacts.next_follow_up_at} IS NOT NULL AND ${contacts.next_follow_up_at} <= now() AND ${contacts.status} <> 'archived' AND ${contacts.deleted_at} IS NULL)::int`,
			archived: sql<number>`COUNT(*) FILTER (WHERE ${contacts.status} = 'archived' AND ${contacts.deleted_at} IS NULL)::int`,
			deleted: sql<number>`COUNT(*) FILTER (WHERE ${contacts.deleted_at} IS NOT NULL)::int`
		})
		.from(contacts)
		.where(and(...filters));

	return json({
		data: {
			leads: Number(row?.leads ?? 0),
			customers: Number(row?.customers ?? 0),
			needs_follow_up: Number(row?.needs_follow_up ?? 0),
			archived: Number(row?.archived ?? 0),
			deleted: Number(row?.deleted ?? 0)
		}
	});
};
