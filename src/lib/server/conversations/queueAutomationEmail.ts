import { and, desc, eq, isNotNull } from 'drizzle-orm';
import { messages, outboxEvents, type Message } from '$lib/server/db/schema';
import type { db } from '$lib/server/db/client';
import { findOrCreateOpenConversation } from './findOrCreateOpenConversation';
import { recordOutboundMessage } from './recordOutboundMessage';

type Db = typeof db;
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
type DbOrTx = Db | Tx;

export type QueueAutomationEmailInput = {
	orgId: string;
	contactId: string;
	contactEmail: string;
	subject: string;
	body: string;
	/**
	 * Source tag stamped on the message row, e.g. 'automation.quote_initial'.
	 * Identifies which automation initiated the send for audit / debugging.
	 */
	source: string;
	/**
	 * Optional pre-resolved conversation id. When omitted,
	 * findOrCreateOpenConversation runs (createdChannel='email').
	 */
	conversationId?: string;
};

/**
 * Queue an automation-driven outbound email through the unified-inbox pipeline.
 *
 * Inserts a `messages` row with status='queued' on the contact's open
 * conversation, plus an `email.send.requested` outbox event in the same
 * transaction. The emailWorker picks it up from there — same lifecycle as
 * contractor-typed messages (queued → sending → sent → delivered/opened, or
 * failed/bounced/undeliverable).
 *
 * Threading: looks up the most recent email in the thread and reuses its
 * subject (prefixed with "Re:" when missing) plus message-id for In-Reply-To
 * and References headers. Callers should still pass a subject — it's used
 * verbatim when the thread has no prior email.
 *
 * Reply alias is provisioned lazily by the email worker on first send. No
 * separate reservation needed here.
 *
 * Caller is responsible for higher-level guards (contact has email, automation
 * cancellation, sent flags) before invoking this.
 */
export async function queueAutomationEmail(
	dbOrTx: DbOrTx,
	input: QueueAutomationEmailInput
): Promise<Message> {
	let conversationId = input.conversationId;
	if (!conversationId) {
		const { conversation } = await findOrCreateOpenConversation(dbOrTx, {
			orgId: input.orgId,
			contactId: input.contactId,
			createdChannel: 'email'
		});
		conversationId = conversation.id;
	}

	const [lastEmail] = await dbOrTx
		.select({
			email_subject: messages.email_subject,
			email_provider_message_id: messages.email_provider_message_id,
			email_references: messages.email_references
		})
		.from(messages)
		.where(
			and(
				eq(messages.conversation_id, conversationId),
				eq(messages.channel, 'email'),
				isNotNull(messages.email_provider_message_id)
			)
		)
		.orderBy(desc(messages.created_at))
		.limit(1);

	let subject = input.subject.trim();
	if (lastEmail?.email_subject) {
		subject = lastEmail.email_subject.startsWith('Re:')
			? lastEmail.email_subject
			: `Re: ${lastEmail.email_subject}`;
	}

	const inReplyTo = lastEmail?.email_provider_message_id ?? undefined;
	const references = lastEmail
		? [lastEmail.email_references, lastEmail.email_provider_message_id]
				.filter(Boolean)
				.join(' ')
				.trim() || undefined
		: undefined;

	const message = await recordOutboundMessage(dbOrTx, {
		orgId: input.orgId,
		conversationId,
		channel: 'email',
		body: input.body,
		sentBy: null,
		status: 'queued',
		source: input.source,
		emailMeta: {
			email_subject: subject,
			email_to_addresses: [input.contactEmail],
			email_in_reply_to: inReplyTo,
			email_references: references
		}
	});

	await dbOrTx.insert(outboxEvents).values({
		org_id: input.orgId,
		event_type: 'email.send.requested',
		resource_type: 'message',
		resource_id: message.id,
		payload: {
			message_id: message.id,
			conversation_id: conversationId,
			contact_id: input.contactId,
			org_id: input.orgId,
			source: input.source
		},
		idempotency_key: `email.send.requested:${message.id}`
	});

	return message;
}
