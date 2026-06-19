import { json, error } from '@sveltejs/kit';
import { and, eq, isNull, type SQL, sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { conversations } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';

// Lightweight count powering the sidebar Inbox badge. Counts OPEN conversations
// with unread inbound messages, scoped identically to the inbox list (org
// isolation + all-vs-assigned visibility). Kept as a single COUNT so it stays
// cheap to refetch on every realtime nudge.
export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);

	if (!auth.member.can_view_all_conversations && !auth.member.can_view_assigned_conversations) {
		error(403, 'Forbidden');
	}

	const conditions: SQL[] = [
		eq(conversations.org_id, auth.orgId),
		isNull(conversations.deleted_at),
		eq(conversations.status, 'open'),
		sql`${conversations.unread_count} > 0`
	];

	if (!auth.member.can_view_all_conversations) {
		conditions.push(eq(conversations.assigned_to, auth.member.id));
	}

	const [row] = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(conversations)
		.where(and(...conditions));

	return json({ data: { count: row?.count ?? 0 } });
};
