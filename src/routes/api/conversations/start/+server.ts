import { json } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { contacts } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { findOrCreateOpenConversation } from '$lib/server/conversations';

const startSchema = z.object({
	contact_id: z.string().uuid('Invalid contact id')
});

/**
 * Create (or reopen) the open conversation for a contact, returning its id. Used
 * by the compose deep link (/inbox/compose) so the conversation row materializes
 * only when the user actually sends a first message. The message itself is then
 * posted through the standard send route (/api/conversations/[id]/messages),
 * keeping all transport/credit/outbox logic in one place.
 */
export const POST: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);

	if (!auth.member.can_send_messages) {
		return json({ error: 'You do not have permission to send messages.' }, { status: 403 });
	}

	let parsed: z.infer<typeof startSchema>;
	try {
		const result = startSchema.safeParse(await event.request.json());
		if (!result.success) {
			const issue = result.error.issues[0];
			const field = String(issue?.path?.[0] ?? '');
			return json(
				{
					error: issue?.message ?? 'Invalid input',
					field_errors: field ? { [field]: issue.message } : undefined
				},
				{ status: 400 }
			);
		}
		parsed = result.data;
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const [contact] = await db
		.select({ id: contacts.id })
		.from(contacts)
		.where(
			and(
				eq(contacts.id, parsed.contact_id),
				eq(contacts.org_id, auth.orgId),
				isNull(contacts.deleted_at)
			)
		)
		.limit(1);
	if (!contact) return json({ error: 'Contact not found.' }, { status: 404 });

	try {
		const conversationId = await db.transaction(async (tx) => {
			const { conversation } = await findOrCreateOpenConversation(tx, {
				orgId: auth.orgId,
				contactId: parsed.contact_id,
				createdChannel: 'sms',
				reactivate: true
			});
			return conversation.id;
		});
		return json({ data: { conversation_id: conversationId } }, { status: 201 });
	} catch {
		return json({ error: 'Failed to start conversation.' }, { status: 500 });
	}
};
