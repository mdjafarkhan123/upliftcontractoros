import { and, eq, isNull } from 'drizzle-orm';
import {
	conversations,
	outboxEvents,
	type Conversation,
	type Message
} from '$lib/server/db/schema';
import type { db } from '$lib/server/db/client';

type Db = typeof db;
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
type DbOrTx = Db | Tx;

export type FindOrCreateOpenConversationInput = {
	orgId: string;
	contactId: string;
	/** Channel that triggered creation — used only for conversation.created outbox payload. */
	createdChannel: Message['channel'];
};

export type FindOrCreateOpenConversationResult = {
	conversation: Conversation;
	created: boolean;
};

/**
 * Find the currently-open non-deleted conversation for (org, contact), or
 * create a new one. When a new conversation is created, also emits a
 * `conversation.created` outbox event in the same tx.
 *
 * Channel-agnostic by design: the inbox is unified, so a given contact has at
 * most one open conversation regardless of which channel the activity arrived
 * on. The `createdChannel` argument is only used to label the outbox payload
 * on creation.
 *
 * Caller is responsible for executing this inside a transaction when atomicity
 * with subsequent message inserts is required (always true for write paths).
 */
export async function findOrCreateOpenConversation(
	dbOrTx: DbOrTx,
	input: FindOrCreateOpenConversationInput
): Promise<FindOrCreateOpenConversationResult> {
	const [existing] = await dbOrTx
		.select()
		.from(conversations)
		.where(
			and(
				eq(conversations.org_id, input.orgId),
				eq(conversations.contact_id, input.contactId),
				eq(conversations.status, 'open'),
				isNull(conversations.deleted_at)
			)
		)
		.limit(1);

	if (existing) return { conversation: existing, created: false };

	const [created] = await dbOrTx
		.insert(conversations)
		.values({
			org_id: input.orgId,
			contact_id: input.contactId,
			status: 'open',
			last_message_at: new Date(),
			unread_count: 0
		})
		.returning();

	await dbOrTx.insert(outboxEvents).values({
		org_id: input.orgId,
		event_type: 'conversation.created',
		resource_type: 'conversation',
		resource_id: created.id,
		payload: {
			conversation_id: created.id,
			org_id: input.orgId,
			contact_id: input.contactId,
			channel: input.createdChannel
		},
		idempotency_key: `conversation.created:${created.id}`
	});

	return { conversation: created, created: true };
}
