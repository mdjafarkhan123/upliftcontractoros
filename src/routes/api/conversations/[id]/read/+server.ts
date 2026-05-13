import { json } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { conversations, messages } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';

function canAccess(
	conv: { assigned_to: string | null },
	member: { id: string; can_view_all_conversations: boolean; can_view_assigned_conversations: boolean }
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

	await db.transaction(async (tx) => {
		await tx
			.update(messages)
			.set({ read_at: new Date(), updated_at: new Date() })
			.where(
				and(
					eq(messages.conversation_id, id),
					eq(messages.direction, 'inbound'),
					isNull(messages.read_at)
				)
			);
		await tx
			.update(conversations)
			.set({ unread_count: 0, updated_at: new Date() })
			.where(eq(conversations.id, id));
	});

	return json({ data: { ok: true } });
};
