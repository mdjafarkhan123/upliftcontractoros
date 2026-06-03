import { json } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { conversations } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';

const schema = z.object({
	tags: z.array(z.string().trim().min(1).max(30)).max(5)
});

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

function normalize(tag: string): string {
	return tag.trim().toLowerCase().replace(/\s+/g, ' ');
}

export const PATCH: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!auth.member.can_send_messages) {
		return json({ error: 'Forbidden.' }, { status: 403 });
	}

	let parsed;
	try {
		const body = await event.request.json();
		const result = schema.safeParse(body);
		if (!result.success) {
			return json(
				{
					error: result.error.issues[0]?.message ?? 'Invalid input',
					field_errors: { tags: result.error.issues[0]?.message ?? 'Invalid' }
				},
				{ status: 400 }
			);
		}
		parsed = result.data;
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const id = event.params.id;
	const [conv] = await db
		.select({ id: conversations.id, assigned_to: conversations.assigned_to })
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

	const normalized = Array.from(new Set(parsed.tags.map(normalize).filter((t) => t.length > 0)));

	const [updated] = await db
		.update(conversations)
		.set({ tags: normalized, updated_at: new Date() })
		.where(and(eq(conversations.id, id), eq(conversations.org_id, auth.orgId)))
		.returning({ id: conversations.id, tags: conversations.tags });

	return json({ data: { tags: updated?.tags ?? [] } });
};
