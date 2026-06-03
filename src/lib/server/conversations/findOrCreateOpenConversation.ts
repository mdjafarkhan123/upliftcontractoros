import { and, desc, eq, isNull, sql } from 'drizzle-orm';
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
	/**
	 * When true (inbound activity), reuse the most-recent non-deleted conversation
	 * regardless of status, reopening it if it was closed/snoozed. This prevents an
	 * inbound reply from forking a new thread when the only existing thread is
	 * closed or snoozed. Defaults to false (legacy "open-only, else create"), which
	 * outbound automation paths still rely on.
	 */
	reactivate?: boolean;
};

export type FindOrCreateOpenConversationResult = {
	conversation: Conversation;
	created: boolean;
	/** True when an existing closed/snoozed conversation was reopened by this call. */
	reactivated: boolean;
};

/**
 * Find an existing conversation for (org, contact) or create a new one. When a
 * new conversation is created, also emits a `conversation.created` outbox event
 * in the same tx.
 *
 * Channel-agnostic by design: the inbox is unified, so a given contact has at
 * most one open conversation regardless of which channel the activity arrived
 * on. A partial unique index (org_id, contact_id) WHERE status='open' AND
 * deleted_at IS NULL enforces this at the DB layer; the INSERT below tolerates a
 * race via ON CONFLICT DO NOTHING + re-select.
 *
 * Caller is responsible for executing this inside a transaction when atomicity
 * with subsequent message inserts is required (always true for write paths).
 */
export async function findOrCreateOpenConversation(
	dbOrTx: DbOrTx,
	input: FindOrCreateOpenConversationInput
): Promise<FindOrCreateOpenConversationResult> {
	if (input.reactivate) {
		// Reuse the most-relevant non-deleted conversation. Prefer an existing open
		// thread (the partial unique index guarantees at most one) so we never reopen
		// a closed thread while an open one already exists — that would violate the
		// index. Only when no open thread exists do we reopen the most-recent
		// closed/snoozed one.
		const [existing] = await dbOrTx
			.select()
			.from(conversations)
			.where(
				and(
					eq(conversations.org_id, input.orgId),
					eq(conversations.contact_id, input.contactId),
					isNull(conversations.deleted_at)
				)
			)
			.orderBy(
				sql`CASE WHEN ${conversations.status} = 'open' THEN 0 ELSE 1 END`,
				sql`${conversations.last_message_at} DESC NULLS LAST`,
				desc(conversations.created_at),
				desc(conversations.id)
			)
			.limit(1);

		if (existing) {
			if (existing.status === 'open') {
				return { conversation: existing, created: false, reactivated: false };
			}
			// Reopen a closed/snoozed thread so inbound activity stays unified.
			const [reopened] = await dbOrTx
				.update(conversations)
				.set({
					status: 'open',
					snoozed_until: null,
					snoozed_by: null,
					closed_at: null,
					closed_by: null,
					closed_reason: null,
					updated_at: new Date()
				})
				.where(eq(conversations.id, existing.id))
				.returning();
			return { conversation: reopened, created: false, reactivated: true };
		}

		return createConversation(dbOrTx, input);
	}

	// Legacy behavior: match the currently-open thread, else create one.
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

	if (existing) return { conversation: existing, created: false, reactivated: false };

	return createConversation(dbOrTx, input);
}

/**
 * Insert a fresh open conversation + conversation.created outbox event. Tolerates
 * the partial-unique-index race: if a concurrent writer inserted the open
 * conversation first, ON CONFLICT DO NOTHING returns nothing and we re-select it.
 */
async function createConversation(
	dbOrTx: DbOrTx,
	input: FindOrCreateOpenConversationInput
): Promise<FindOrCreateOpenConversationResult> {
	const [created] = await dbOrTx
		.insert(conversations)
		.values({
			org_id: input.orgId,
			contact_id: input.contactId,
			status: 'open',
			last_message_at: new Date(),
			unread_count: 0
		})
		.onConflictDoNothing()
		.returning();

	if (!created) {
		// Lost the race — the open conversation already exists. Re-select it.
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
		if (!existing) {
			throw new Error('findOrCreateOpenConversation: conflict but no open conversation found');
		}
		return { conversation: existing, created: false, reactivated: false };
	}

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

	return { conversation: created, created: true, reactivated: false };
}
