/**
 * POST /api/conversations/[id]/typing
 * Authenticated — contractor typing indicator for webchat widget.
 * Body: { is_typing: boolean }
 */
import { json } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { conversations } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { recordTyping } from '$lib/server/webchat/typingStore';

const typingSchema = z.object({
	is_typing: z.boolean()
});

export const POST: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);

	const conversationId = event.params.id;

	let parsed: z.infer<typeof typingSchema>;
	try {
		const body = await event.request.json();
		const result = typingSchema.safeParse(body);
		if (!result.success) {
			return json({ error: 'Invalid input' }, { status: 400 });
		}
		parsed = result.data;
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const [conv] = await db
		.select({ id: conversations.id })
		.from(conversations)
		.where(
			and(
				eq(conversations.id, conversationId),
				eq(conversations.org_id, auth.orgId),
				isNull(conversations.deleted_at)
			)
		)
		.limit(1);

	if (!conv) {
		return json({ error: 'Conversation not found' }, { status: 404 });
	}

	recordTyping(conversationId, parsed.is_typing);
	return new Response(null, { status: 204 });
};
