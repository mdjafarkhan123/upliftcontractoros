import { outboxEvents, type Message } from '$lib/server/db/schema';
import type { db } from '$lib/server/db/client';
import { findOrCreateOpenConversation } from './findOrCreateOpenConversation';
import { recordOutboundMessage } from './recordOutboundMessage';

type Db = typeof db;
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
type DbOrTx = Db | Tx;

export type QueueAutomationSmsInput = {
	orgId: string;
	contactId: string;
	body: string;
	/**
	 * Source tag stamped on the message row, e.g. 'automation.review_request'.
	 * Identifies which automation initiated the send for audit / debugging.
	 */
	source: string;
	/**
	 * Optional pre-resolved conversation id. Use this when the caller already
	 * has an open conversation it wants the message to land in (e.g. the
	 * missed-call thread). When omitted, findOrCreateOpenConversation runs.
	 */
	conversationId?: string;
};

/**
 * Queue an automation-driven outbound SMS through the unified-inbox pipeline.
 *
 * Inserts a `messages` row with status='queued' on the contact's open
 * conversation, plus an `sms.send.requested` outbox event in the same
 * transaction. The smsWorker picks it up from there — same lifecycle as
 * contractor-typed messages (queued → sending → sent → delivered, with
 * Twilio status callbacks driving the terminal states).
 *
 * Caller is responsible for higher-level guards (opt-out check, sent flags,
 * automation cancellation) before invoking this — those concerns belong to
 * the automation handler, not the unified-pipeline plumbing.
 */
export async function queueAutomationSms(
	dbOrTx: DbOrTx,
	input: QueueAutomationSmsInput
): Promise<Message> {
	let conversationId = input.conversationId;
	if (!conversationId) {
		const { conversation } = await findOrCreateOpenConversation(dbOrTx, {
			orgId: input.orgId,
			contactId: input.contactId,
			createdChannel: 'sms'
		});
		conversationId = conversation.id;
	}

	const message = await recordOutboundMessage(dbOrTx, {
		orgId: input.orgId,
		conversationId,
		channel: 'sms',
		body: input.body,
		sentBy: null,
		status: 'queued',
		source: input.source
	});

	await dbOrTx.insert(outboxEvents).values({
		org_id: input.orgId,
		event_type: 'sms.send.requested',
		resource_type: 'message',
		resource_id: message.id,
		payload: {
			message_id: message.id,
			conversation_id: conversationId,
			contact_id: input.contactId,
			org_id: input.orgId,
			source: input.source
		},
		idempotency_key: `sms.send.requested:${message.id}`
	});

	return message;
}
