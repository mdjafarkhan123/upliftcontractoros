import { json } from '@sveltejs/kit';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { conversations } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';

function canAccess(
	conv: { assigned_to: string | null },
	member: {
		id: string;
		can_view_all_conversations: boolean;
		can_view_assigned_conversations: boolean;
	}
): boolean {
	if (member.can_view_all_conversations) return true;
	if (member.can_view_assigned_conversations && conv.assigned_to === member.id) return true;
	return false;
}

export const PATCH: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);

	const id = event.params.id;
	const [conv] = await db
		.select()
		.from(conversations)
		.where(
			and(
				eq(conversations.id, id),
				eq(conversations.org_id, auth.orgId),
				isNull(conversations.deleted_at)
			)
		)
		.limit(1);
	if (!conv) return json({ error: 'Conversation not found.' }, { status: 404 });
	if (!canAccess(conv, auth.member)) return json({ error: 'Forbidden.' }, { status: 403 });

	// Atomic mark-read + drift-safe recount in a single statement (P2-D Part 1).
	await db.execute(sql`
		WITH updated AS (
			UPDATE messages
			SET read_at = NOW()
			WHERE conversation_id = ${id}
				AND direction = 'inbound'
				AND read_at IS NULL
			RETURNING id
		),
		actual AS (
			SELECT COUNT(*)::int AS cnt
			FROM messages
			WHERE conversation_id = ${id}
				AND direction = 'inbound'
				AND read_at IS NULL
		)
		UPDATE conversations
		SET unread_count = actual.cnt,
			updated_at = NOW()
		FROM actual
		WHERE conversations.id = ${id}
			AND conversations.org_id = ${auth.orgId}
	`);

	return json({ data: { ok: true } });
};
