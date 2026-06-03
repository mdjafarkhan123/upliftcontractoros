import { Worker, type Job } from 'bullmq';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import {
	contacts,
	conversations,
	media,
	messages,
	organizations,
	outboxEvents
} from '$lib/server/db/schema';
import { SMS_QUEUE, redisConnection } from '$lib/server/queue/bullmq';
import { sendSms } from '$lib/server/twilio/sendSms';
import { r2Presign } from '$lib/server/media/r2';
import { isReleasedPhone } from '$lib/utils/phone';
import { createLogger } from '$lib/server/log';
import {
	reserveSmsCredit,
	refundSmsCredit,
	getCreditState,
	InsufficientCreditError
} from '$lib/server/sms/credit';

const env = process.env;
const log = createLogger('sms.worker');

type SmsJobData = {
	outbox_event_id: string;
	event_type: string;
	org_id: string | null;
	resource_type: string;
	resource_id: string; // message_id
	payload: Record<string, unknown>;
};

/**
 * Permanent failures we should NOT retry. Twilio surfaces these as exceptions
 * with codes / messages during the create() call (e.g. invalid 'to' number,
 * unsubscribed recipient, geo-permission denied).
 */
function isPermanentFailure(err: unknown): boolean {
	const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
	return (
		(msg.includes('invalid') && (msg.includes('to') || msg.includes('phone'))) ||
		msg.includes('unsubscribed') ||
		msg.includes('not a valid phone number') ||
		msg.includes('blocked') ||
		msg.includes('region') ||
		msg.includes('geo-permission')
	);
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

function statusCallbackUrl(): string | undefined {
	const base = env.PUBLIC_BASE_URL?.trim();
	if (!base) return undefined;
	return `${base.replace(/\/$/, '')}/api/webhooks/twilio/status`;
}

async function processSmsSend(job: Job<SmsJobData>) {
	const data = job.data;
	const messageId = data.resource_id;

	const [msg] = await db.select().from(messages).where(eq(messages.id, messageId)).limit(1);
	if (!msg) {
		log.warn({ phase: 'message_missing', message_id: messageId });
		return;
	}
	if (msg.channel !== 'sms' || msg.direction !== 'outbound') {
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

	const [contact] = await db
		.select({ id: contacts.id, phone: contacts.phone, sms_opt_out: contacts.sms_opt_out })
		.from(contacts)
		.where(eq(contacts.id, conv.contact_id))
		.limit(1);
	if (!contact?.phone) {
		await db
			.update(messages)
			.set({
				status: 'undeliverable',
				failure_reason: 'Contact has no phone number',
				failed_at: new Date(),
				updated_at: new Date()
			})
			.where(eq(messages.id, messageId));
		return;
	}
	if (contact.sms_opt_out) {
		await db
			.update(messages)
			.set({
				status: 'undeliverable',
				failure_reason: 'Contact has opted out of SMS',
				failed_at: new Date(),
				updated_at: new Date()
			})
			.where(eq(messages.id, messageId));
		return;
	}
	if (isReleasedPhone(contact.phone)) {
		await db
			.update(messages)
			.set({
				status: 'undeliverable',
				failure_reason: 'Contact phone number has been released',
				failed_at: new Date(),
				updated_at: new Date()
			})
			.where(eq(messages.id, messageId));
		return;
	}

	const [org] = await db
		.select({
			twilio_phone_number: organizations.twilio_phone_number
		})
		.from(organizations)
		.where(eq(organizations.id, msg.org_id))
		.limit(1);
	if (!org?.twilio_phone_number) {
		await db
			.update(messages)
			.set({
				status: 'undeliverable',
				failure_reason: 'Organization is not configured for SMS',
				failed_at: new Date(),
				updated_at: new Date()
			})
			.where(eq(messages.id, messageId));
		return;
	}

	const credit = await getCreditState(db, msg.org_id);
	if (!credit) {
		await db
			.update(messages)
			.set({
				status: 'undeliverable',
				failure_reason: 'Organization has no SMS credit account',
				failed_at: new Date(),
				updated_at: new Date()
			})
			.where(eq(messages.id, messageId));
		return;
	}
	const costStr = credit.per_sms_cost.toFixed(4);

	// Authoritative credit reservation: atomic guarded decrement, committed
	// BEFORE the Twilio call so the balance can never go negative under
	// concurrency. Idempotent on message_id — a retry that already reserved
	// returns 'already_charged' and does not double-deduct. On insufficient
	// credit the throw rolls back (nothing applied) and we mark undeliverable.
	try {
		await db.transaction(async (tx) => {
			await reserveSmsCredit(tx, {
				orgId: msg.org_id,
				messageId,
				cost: costStr,
				monthlyIncludedCredit: credit.monthly_included_credit
			});
		});
	} catch (err) {
		if (err instanceof InsufficientCreditError) {
			log.warn({
				phase: 'insufficient_credit',
				message_id: messageId,
				org_id: msg.org_id,
				balance: err.balance,
				cost: err.cost
			});
			await db
				.update(messages)
				.set({
					status: 'undeliverable',
					failure_reason: 'Insufficient SMS credit. Top up to keep sending.',
					failed_at: new Date(),
					updated_at: new Date()
				})
				.where(eq(messages.id, messageId));
			return;
		}
		throw err;
	}

	// Outbound MMS: attach this message's media as publicly-fetchable presigned
	// R2 URLs (Twilio fetches them at send time). Prefer the resized web variant
	// for photos to keep MMS payloads small; fall back to the original.
	const mediaRows = await db
		.select({
			r2_key: media.r2_key,
			web_key: media.web_key,
			media_type: media.media_type
		})
		.from(media)
		.where(and(eq(media.message_id, messageId), isNull(media.deleted_at)));
	const mediaUrl =
		mediaRows.length > 0
			? await Promise.all(
					mediaRows.map((mm) =>
						r2Presign(mm.media_type === 'photo' && mm.web_key ? mm.web_key : mm.r2_key, 3600)
					)
				)
			: undefined;

	try {
		const sid = await sendSms(org.twilio_phone_number, contact.phone, msg.body ?? '', {
			statusCallback: statusCallbackUrl(),
			mediaUrl
		});

		await db.transaction(async (tx) => {
			await tx
				.update(messages)
				.set({
					status: 'sent',
					twilio_message_sid: sid ?? undefined,
					sms_cost: costStr,
					sent_at: new Date(),
					updated_at: new Date()
				})
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
					channel: 'sms',
					body: msg.body,
					twilio_message_sid: sid,
					sent_by: msg.sent_by
				},
				idempotency_key: `message.sent:${messageId}`
			});
		});
	} catch (err) {
		const reason = err instanceof Error ? err.message : String(err);
		const permanent = isPermanentFailure(err);
		log.error({
			phase: 'send_failed',
			message_id: messageId,
			attempt: attemptNumber,
			permanent,
			has_media: mediaRows.length > 0,
			error: reason
		});

		// MMS: fail immediately (no auto-retry), refund the reserved credit, and let
		// the contractor retry manually. We don't throw, so BullMQ won't re-attempt.
		if (mediaRows.length > 0) {
			await db.transaction(async (tx) => {
				await tx
					.update(messages)
					.set({
						status: 'failed',
						failure_reason: reason,
						failed_at: new Date(),
						updated_at: new Date()
					})
					.where(eq(messages.id, messageId));
				await refundSmsCredit(tx, {
					orgId: msg.org_id,
					messageId,
					note: 'MMS send failed'
				});
			});
			return;
		}

		if (permanent) {
			// Reserved credit was never spent — refund so the contractor isn't
			// charged for a send Twilio rejected. Idempotent on message_id.
			await db.transaction(async (tx) => {
				await tx
					.update(messages)
					.set({
						status: 'undeliverable',
						failure_reason: reason,
						failed_at: new Date(),
						updated_at: new Date()
					})
					.where(eq(messages.id, messageId));
				await refundSmsCredit(tx, {
					orgId: msg.org_id,
					messageId,
					note: 'Permanent send failure'
				});
			});
			return;
		}

		if (attemptNumber >= (job.opts.attempts ?? 3)) {
			// All retries exhausted — refund the reservation.
			await db.transaction(async (tx) => {
				await tx
					.update(messages)
					.set({
						status: 'failed',
						failure_reason: reason,
						failed_at: new Date(),
						updated_at: new Date()
					})
					.where(eq(messages.id, messageId));
				await refundSmsCredit(tx, {
					orgId: msg.org_id,
					messageId,
					note: 'Send retries exhausted'
				});
			});
		}
		throw err;
	}
}

export const smsWorker = new Worker<SmsJobData>(
	SMS_QUEUE,
	async (job) => {
		if (job.name !== 'sms.send.requested') {
			log.warn({ phase: 'unknown_job', name: job.name });
			return;
		}
		await processSmsSend(job);
	},
	{
		connection: redisConnection(),
		concurrency: Number(env.SMS_WORKER_CONCURRENCY ?? '4')
	}
);

smsWorker.on('failed', (job, err) => {
	console.error(`[sms] job ${job?.id} (${job?.name}) failed:`, err.message);
});
