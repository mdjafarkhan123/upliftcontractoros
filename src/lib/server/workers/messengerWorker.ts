import { Worker, type Job } from 'bullmq';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import {
	conversations,
	messages,
	messengerContacts,
	messengerIntegrations,
	outboxEvents
} from '$lib/server/db/schema';
import { MESSENGER_QUEUE, redisConnection } from '$lib/server/queue/bullmq';
import {
	sendTextMessage,
	isMessengerWindowError,
	isPermanentSendError
} from '$lib/server/messenger/graph';
import { createLogger } from '$lib/server/log';
import {
	canContactReceiveCommunication,
	communicationCategoryFromSource
} from '$lib/server/communication-preferences';

const env = process.env;
const log = createLogger('messenger.worker');

// Shown to the contractor when a reply can no longer be delivered because the
// customer hasn't messaged in >24h (Meta's standard messaging window).
const WINDOW_EXPIRED_REASON =
	"Messenger replies must be sent within 24 hours of the customer's last message. Send via SMS or email instead.";

type MessengerJobData = {
	outbox_event_id: string;
	event_type: string;
	org_id: string | null;
	resource_type: string;
	resource_id: string; // message_id
	payload: Record<string, unknown>;
};

async function markUndeliverable(messageId: string, reason: string): Promise<void> {
	await db
		.update(messages)
		.set({
			status: 'undeliverable',
			failure_reason: reason,
			failed_at: new Date(),
			updated_at: new Date()
		})
		.where(eq(messages.id, messageId));
}

async function markSending(messageId: string): Promise<boolean> {
	const res = await db
		.update(messages)
		.set({ status: 'sending', send_attempts: 1, updated_at: new Date() })
		.where(and(eq(messages.id, messageId), eq(messages.status, 'queued')))
		.returning({ id: messages.id });
	return res.length > 0;
}

async function bumpAttempts(messageId: string, attempts: number) {
	await db
		.update(messages)
		.set({ send_attempts: attempts, updated_at: new Date() })
		.where(eq(messages.id, messageId));
}

async function processMessengerSend(job: Job<MessengerJobData>) {
	const messageId = job.data.resource_id;

	const [msg] = await db.select().from(messages).where(eq(messages.id, messageId)).limit(1);
	if (!msg) {
		log.warn({ phase: 'message_missing', message_id: messageId });
		return;
	}
	if (msg.channel !== 'messenger' || msg.direction !== 'outbound') {
		log.warn({
			phase: 'wrong_kind',
			message_id: messageId,
			channel: msg.channel,
			direction: msg.direction
		});
		return;
	}
	if (msg.status !== 'queued' && msg.status !== 'sending' && msg.status !== 'failed') {
		log.info({ phase: 'already_processed', message_id: messageId, status: msg.status });
		return;
	}

	if (msg.status === 'queued') {
		const claimed = await markSending(messageId);
		if (!claimed) {
			log.info({ phase: 'claim_lost', message_id: messageId });
			return;
		}
	}
	const attemptNumber = job.attemptsMade + 1;
	if (attemptNumber > 1) await bumpAttempts(messageId, attemptNumber);

	const [conv] = await db
		.select()
		.from(conversations)
		.where(eq(conversations.id, msg.conversation_id))
		.limit(1);
	if (!conv) throw new Error(`Conversation ${msg.conversation_id} not found`);
	const eligibility = await canContactReceiveCommunication({
		orgId: msg.org_id,
		contactId: conv.contact_id,
		channel: 'messenger',
		direction: 'outbound',
		category: communicationCategoryFromSource(msg.source),
		conversationId: conv.id
	});
	if (!eligibility.allowed) {
		await markUndeliverable(
			messageId,
			eligibility.reasonMessage ?? 'Customer communication is blocked'
		);
		return;
	}

	// Resolve the recipient PSID + the Page it belongs to from the contact's
	// Messenger identity, then the live Page token from the org's integration.
	const [identity] = await db
		.select({ page_id: messengerContacts.page_id, psid: messengerContacts.psid })
		.from(messengerContacts)
		.where(
			and(
				eq(messengerContacts.org_id, msg.org_id),
				eq(messengerContacts.contact_id, conv.contact_id)
			)
		)
		.limit(1);
	if (!identity) {
		await markUndeliverable(messageId, 'Contact has no Messenger identity on file.');
		return;
	}

	const [integration] = await db
		.select({
			page_access_token: messengerIntegrations.page_access_token,
			status: messengerIntegrations.status
		})
		.from(messengerIntegrations)
		.where(
			and(
				eq(messengerIntegrations.org_id, msg.org_id),
				eq(messengerIntegrations.page_id, identity.page_id),
				isNull(messengerIntegrations.deleted_at)
			)
		)
		.limit(1);
	if (!integration || integration.status !== 'connected') {
		await markUndeliverable(
			messageId,
			'Facebook Page is not connected. Reconnect it in Settings to send Messenger replies.'
		);
		return;
	}

	const body = msg.body?.trim() ?? '';
	if (!body) {
		await markUndeliverable(messageId, 'Message body is empty.');
		return;
	}

	try {
		const mid = await sendTextMessage(integration.page_access_token, identity.psid, body);

		await db.transaction(async (tx) => {
			await tx
				.update(messages)
				.set({ status: 'sent', sent_at: new Date(), updated_at: new Date() })
				.where(eq(messages.id, messageId));

			await tx.insert(outboxEvents).values({
				org_id: msg.org_id,
				event_type: 'message.sent',
				resource_type: 'message',
				resource_id: messageId,
				payload: {
					message_id: messageId,
					conversation_id: conv.id,
					contact_id: conv.contact_id,
					org_id: msg.org_id,
					channel: 'messenger',
					body: msg.body,
					messenger_message_id: mid,
					sent_by: msg.sent_by
				},
				idempotency_key: `message.sent:${messageId}`
			});
		});
	} catch (err) {
		const reason = err instanceof Error ? err.message : String(err);

		// 24h window expired — permanent. Surface an actionable reason and do NOT
		// retry (a RESPONSE send can only succeed inside the window).
		if (isMessengerWindowError(err)) {
			log.warn({
				phase: 'window_expired',
				code: 'MESSENGER_WINDOW_EXPIRED',
				message_id: messageId
			});
			await markUndeliverable(messageId, WINDOW_EXPIRED_REASON);
			return;
		}

		// Other permanent failures (blocked/invalid recipient, revoked permission).
		if (isPermanentSendError(err)) {
			log.error({ phase: 'send_failed_permanent', message_id: messageId, error: reason });
			await markUndeliverable(messageId, reason);
			return;
		}

		log.error({
			phase: 'send_failed',
			message_id: messageId,
			attempt: attemptNumber,
			error: reason
		});

		if (attemptNumber >= (job.opts.attempts ?? 3)) {
			await db
				.update(messages)
				.set({
					status: 'failed',
					failure_reason: reason,
					failed_at: new Date(),
					updated_at: new Date()
				})
				.where(eq(messages.id, messageId));
		}
		throw err;
	}
}

export const messengerWorker = new Worker<MessengerJobData>(
	MESSENGER_QUEUE,
	async (job) => {
		if (job.name !== 'messenger.send.requested') {
			log.warn({ phase: 'unknown_job', name: job.name });
			return;
		}
		await processMessengerSend(job);
	},
	{
		connection: redisConnection(),
		concurrency: Number(env.MESSENGER_WORKER_CONCURRENCY ?? '4')
	}
);

messengerWorker.on('failed', (job, err) => {
	console.error(`[messenger] job ${job?.id} (${job?.name}) failed:`, err.message);
});
