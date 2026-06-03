import { json, error } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { conversations, messages, outboxEvents } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { createLogger } from '$lib/server/log';

const log = createLogger('inbox.message.retry');

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

export const POST: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);

	if (!auth.member.can_send_messages) {
		return json({ error: 'You do not have permission to send messages.' }, { status: 403 });
	}

	const { id: conversationId, messageId } = event.params;

	const [conv] = await db
		.select()
		.from(conversations)
		.where(
			and(
				eq(conversations.id, conversationId),
				eq(conversations.org_id, auth.orgId),
				isNull(conversations.deleted_at)
			)
		)
		.limit(1);
	if (!conv) error(404, 'Conversation not found');
	if (!canAccess(conv, auth.member)) error(403, 'Forbidden');

	const [msg] = await db
		.select()
		.from(messages)
		.where(
			and(
				eq(messages.id, messageId),
				eq(messages.conversation_id, conversationId),
				eq(messages.org_id, auth.orgId)
			)
		)
		.limit(1);
	if (!msg) return json({ error: 'Message not found.' }, { status: 404 });

	if (msg.direction !== 'outbound' || msg.is_internal_note) {
		return json({ error: 'Only outbound messages can be retried.' }, { status: 400 });
	}
	if (msg.status !== 'failed') {
		// Permanent failures (undeliverable, bounced) are not retryable — the
		// underlying cause (opt-out, invalid number, hard bounce) won't change
		// on a retry.
		return json({ error: 'This message cannot be retried.' }, { status: 400 });
	}
	if (msg.channel !== 'sms' && msg.channel !== 'email') {
		return json({ error: 'Channel does not support retry.' }, { status: 400 });
	}

	const eventType = msg.channel === 'sms' ? 'sms.send.requested' : 'email.send.requested';
	const nowIso = Date.now();
	const idempotencyKey = `${eventType}:${messageId}:retry:${nowIso}`;

	try {
		const updated = await db.transaction(async (tx) => {
			// Re-claim the row only if it is still 'failed' — guards concurrent retries.
			const reset = await tx
				.update(messages)
				.set({
					status: 'queued',
					failure_reason: null,
					failed_at: null,
					updated_at: new Date()
				})
				.where(and(eq(messages.id, messageId), eq(messages.status, 'failed')))
				.returning();
			if (reset.length === 0) {
				throw new Error('Message status changed; cannot retry.');
			}

			await tx.insert(outboxEvents).values({
				org_id: auth.orgId,
				event_type: eventType,
				resource_type: 'message',
				resource_id: messageId,
				payload: {
					message_id: messageId,
					conversation_id: conversationId,
					contact_id: conv.contact_id,
					org_id: auth.orgId,
					retry: true
				},
				idempotency_key: idempotencyKey
			});

			return reset[0];
		});

		return json({ data: { message: updated } });
	} catch (e) {
		const reason = e instanceof Error ? e.message : String(e);
		log.error({ phase: 'retry_failed', message_id: messageId, error: reason });
		return json({ error: reason }, { status: 409 });
	}
};
