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
import { SMS_QUEUE, redisConnection, smsQueue } from '$lib/server/queue/bullmq';
import { sendSms } from '$lib/server/twilio/sendSms';
import { reserveSmsRateSlot } from '$lib/server/sms/rateLimit';
import { isWithinQuietHours, msUntilQuietHoursEnd } from '$lib/server/sms/quietHours';
import { r2Presign } from '$lib/server/media/r2';
import { isReleasedPhone } from '$lib/utils/phone';
import { createLogger } from '$lib/server/log';
import {
	canContactReceiveCommunication,
	communicationCategoryFromSource
} from '$lib/server/communication-preferences';
import { changeCommunicationPreferenceInTransaction } from '$lib/server/communication-preferences/mutations';
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
	// Set when a job is re-enqueued because it hit a rate limit. Carried only for
	// observability/jitter — the message keeps deferring until a slot frees up.
	throttle_count?: number;
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

function dndStatusForTwilioError(err: unknown): 'blocked' | 'permanent' | null {
	const code = String((err as { code?: unknown })?.code ?? '').trim();
	if (code === '30004') return 'permanent';
	if (code === '30003' || code === '30005' || code === '30006') return 'blocked';
	return null;
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
	// APP_URL is the canonical public base (used by the Twilio/Telnyx clients);
	// PUBLIC_BASE_URL kept as a fallback for older env files.
	const base = (env.APP_URL ?? env.PUBLIC_BASE_URL)?.trim();
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
	const eligibility = await canContactReceiveCommunication({
		orgId: msg.org_id,
		contactId: contact.id,
		channel: 'sms',
		direction: 'outbound',
		category: communicationCategoryFromSource(msg.source)
	});
	if (!eligibility.allowed) {
		await db
			.update(messages)
			.set({
				status: 'undeliverable',
				failure_reason: eligibility.reasonMessage ?? 'Customer communication is blocked',
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
			sms_enabled: organizations.sms_enabled,
			twilio_phone_number: organizations.twilio_phone_number,
			twilio_subaccount_sid: organizations.twilio_subaccount_sid,
			sms_approval_status: organizations.sms_approval_status,
			timezone: organizations.timezone,
			quiet_hours_enabled: organizations.quiet_hours_enabled,
			quiet_hours_start_hour: organizations.quiet_hours_start_hour,
			quiet_hours_end_hour: organizations.quiet_hours_end_hour,
			max_sms_per_minute: organizations.max_sms_per_minute,
			max_sms_per_day: organizations.max_sms_per_day
		})
		.from(organizations)
		.where(eq(organizations.id, msg.org_id))
		.limit(1);
	// Master SMS gate (PO-controlled, organizations.sms_enabled). This is the single
	// authoritative chokepoint for ALL outbound SMS — manual, bulk, and automation all
	// converge here via sendSms. Off → block outbound; inbound + email are unaffected.
	if (org && !org.sms_enabled) {
		await db
			.update(messages)
			.set({
				status: 'undeliverable',
				failure_reason: 'SMS is disabled for this organization',
				failed_at: new Date(),
				updated_at: new Date()
			})
			.where(eq(messages.id, messageId));
		return;
	}
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
	// Carrier-approval gate (Onboarding.md Case C). The number can receive calls +
	// inbound SMS immediately, but outbound stays blocked until carrier registration
	// (US 10DLC / Canada CWTA) is approved. 'not_required' and 'approved' pass;
	// 'pending' and 'rejected' block. PO flips this in /jafar once registration clears.
	if (org.sms_approval_status === 'pending' || org.sms_approval_status === 'rejected') {
		await db
			.update(messages)
			.set({
				status: 'undeliverable',
				failure_reason:
					org.sms_approval_status === 'rejected'
						? 'Carrier registration was rejected — outbound SMS is blocked'
						: 'Outbound SMS is pending carrier approval',
				failed_at: new Date(),
				updated_at: new Date()
			})
			.where(eq(messages.id, messageId));
		return;
	}

	// Quiet-hours gate (Blueprint §10 / Onboarding.md Part 10 compliance). Held
	// during the org's configured window, evaluated in its own timezone. Deferred —
	// never dropped: the message reverts to 'queued' and the job is re-enqueued to
	// fire when the window opens. Checked BEFORE rate-limit + credit reservation so a
	// held send consumes neither. Fails open (sends) on a timezone bug so a tz fault
	// can never freeze all outbound SMS.
	if (org.quiet_hours_enabled) {
		let withinQuietHours = false;
		try {
			withinQuietHours = isWithinQuietHours(
				new Date(),
				org.timezone,
				org.quiet_hours_start_hour,
				org.quiet_hours_end_hour
			);
		} catch (err) {
			log.error({
				phase: 'quiet_hours_eval_failed',
				message_id: messageId,
				org_id: msg.org_id,
				timezone: org.timezone,
				error: err instanceof Error ? err.message : String(err)
			});
		}
		if (withinQuietHours) {
			const delay = msUntilQuietHoursEnd(new Date(), org.timezone, org.quiet_hours_end_hour);
			log.info({
				phase: 'quiet_hours_deferred',
				message_id: messageId,
				org_id: msg.org_id,
				timezone: org.timezone,
				delay_ms: delay
			});
			// Revert the claim so the message reads as 'waiting to send' (no 'held'
			// status exists); the delayed job re-claims it via markSending.
			await db
				.update(messages)
				.set({ status: 'queued', send_attempts: 0, updated_at: new Date() })
				.where(eq(messages.id, messageId));
			await smsQueue().add('sms.send.requested', data, { delay });
			return;
		}
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

	// Rate limiting (per-org/min, per-org/day, global/min). Checked BEFORE credit
	// reservation so a throttled send never reserves credit or burns a send
	// attempt. On a limit hit we re-enqueue the same job with a delay and return —
	// the message keeps its 'sending' status, so the delayed job reprocesses it
	// cleanly. One re-enqueue per processing (1:1, no fan-out); the existing
	// status + credit idempotency guards make a duplicate job a no-op.
	const rate = await reserveSmsRateSlot(msg.org_id, {
		perMin: org.max_sms_per_minute,
		perDay: org.max_sms_per_day
	});
	if (!rate.allowed) {
		log.info({
			phase: 'rate_limited',
			message_id: messageId,
			org_id: msg.org_id,
			limit: rate.limit,
			retry_after_ms: rate.retryAfterMs
		});
		await smsQueue().add(
			'sms.send.requested',
			{ ...data, throttle_count: (data.throttle_count ?? 0) + 1 },
			{ delay: rate.retryAfterMs }
		);
		return;
	}

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
			mediaUrl,
			subaccountSid: org.twilio_subaccount_sid
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
				const dndStatus = dndStatusForTwilioError(err);
				if (dndStatus) {
					await changeCommunicationPreferenceInTransaction(tx, {
						orgId: msg.org_id,
						contactId: conv.contact_id,
						channel: 'sms',
						direction: 'outbound',
						category: 'all',
						status: dndStatus,
						source: 'provider',
						reasonCode: `TWILIO_${String((err as { code?: unknown }).code)}`,
						reasonMessage: reason,
						provider: 'twilio',
						providerEventId: `send-error:${messageId}:${String((err as { code?: unknown }).code)}`,
						metadata: { error_code: String((err as { code?: unknown }).code) }
					});
				}
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

/**
 * Staff-alert SMS (Notification system Stage 1.c-2). A team member gets a text on
 * their `notification_phone` (NOT a customer number) for a critical/high alert. This
 * path is intentionally separate from processSmsSend: it writes NO messages /
 * conversation row and skips every customer-facing gate (contact opt-out, released
 * number, org quiet hours — those are customer-TCPA concerns). It still passes the org
 * SMS master-gate + carrier-approval gate and reserves real credit before sending.
 *
 * Idempotency: the credit reservation is keyed on a synthetic message id
 * `member_notif:{outbox_event_id}:{member_id}`, so a retry never double-charges; the
 * BullMQ jobId (set by the outbox dispatcher) blocks duplicate enqueues.
 *
 * Staff opt-out is governed upstream by `sms_notifications_allowed` + per-type prefs
 * (resolveChannels), so there is no per-SMS STOP footer here — Twilio still honors
 * carrier-level STOP keywords per recipient.
 */
async function processMemberSmsSend(job: Job<SmsJobData>) {
	const data = job.data;
	const p = data.payload as {
		org_id?: string;
		member_id?: string;
		notification_phone?: string;
		body?: string;
	};
	const orgId = p.org_id ?? data.org_id ?? undefined;
	const memberId = p.member_id;
	const toPhone = p.notification_phone?.trim();
	const body = p.body;
	if (!orgId || !memberId || !toPhone || !body) {
		log.warn({
			phase: 'member_sms_missing_fields',
			outbox_event_id: data.outbox_event_id,
			has_org: Boolean(orgId),
			has_member: Boolean(memberId),
			has_phone: Boolean(toPhone),
			has_body: Boolean(body)
		});
		return;
	}

	const [org] = await db
		.select({
			sms_enabled: organizations.sms_enabled,
			twilio_phone_number: organizations.twilio_phone_number,
			twilio_subaccount_sid: organizations.twilio_subaccount_sid,
			sms_approval_status: organizations.sms_approval_status
		})
		.from(organizations)
		.where(eq(organizations.id, orgId))
		.limit(1);

	// Org SMS master-gate — the same chokepoint customer SMS passes. Off / unconfigured
	// / unapproved → drop silently (the member still got in-app + push upstream). No row
	// to mark, so we just return; nothing is charged.
	if (!org || !org.sms_enabled || !org.twilio_phone_number) {
		log.info({ phase: 'member_sms_gate_blocked', org_id: orgId, member_id: memberId });
		return;
	}
	if (org.sms_approval_status === 'pending' || org.sms_approval_status === 'rejected') {
		log.info({
			phase: 'member_sms_carrier_blocked',
			org_id: orgId,
			member_id: memberId,
			approval: org.sms_approval_status
		});
		return;
	}

	const credit = await getCreditState(db, orgId);
	if (!credit) {
		log.warn({ phase: 'member_sms_no_credit_account', org_id: orgId, member_id: memberId });
		return;
	}
	const costStr = credit.per_sms_cost.toFixed(4);
	const synthMessageId = `member_notif:${data.outbox_event_id}:${memberId}`;

	// Reserve credit BEFORE the Twilio call (committed first so the balance can never go
	// negative). Idempotent on the synthetic id — a retry returns 'already_charged'.
	try {
		await db.transaction(async (tx) => {
			await reserveSmsCredit(tx, {
				orgId,
				messageId: synthMessageId,
				cost: costStr,
				monthlyIncludedCredit: credit.monthly_included_credit
			});
		});
	} catch (err) {
		if (err instanceof InsufficientCreditError) {
			log.warn({
				phase: 'member_sms_insufficient_credit',
				org_id: orgId,
				member_id: memberId,
				balance: err.balance,
				cost: err.cost
			});
			return; // dropped, not charged
		}
		throw err;
	}

	const attemptNumber = job.attemptsMade + 1;

	try {
		await sendSms(org.twilio_phone_number, toPhone, body, {
			subaccountSid: org.twilio_subaccount_sid
		});
		log.info({ phase: 'member_sms_sent', org_id: orgId, member_id: memberId });
	} catch (err) {
		const reason = err instanceof Error ? err.message : String(err);
		const permanent = isPermanentFailure(err);
		log.error({
			phase: 'member_sms_send_failed',
			org_id: orgId,
			member_id: memberId,
			attempt: attemptNumber,
			permanent,
			error: reason
		});

		if (permanent) {
			// Twilio rejected it outright — refund so the org isn't charged for a send
			// that never went out. Idempotent on the synthetic id.
			await db.transaction(async (tx) => {
				await refundSmsCredit(tx, {
					orgId,
					messageId: synthMessageId,
					note: 'Permanent member SMS failure'
				});
			});
			return;
		}

		if (attemptNumber >= (job.opts.attempts ?? 3)) {
			// All retries exhausted — refund the reservation.
			await db.transaction(async (tx) => {
				await refundSmsCredit(tx, {
					orgId,
					messageId: synthMessageId,
					note: 'Member SMS retries exhausted'
				});
			});
		}
		throw err; // let BullMQ retry transient failures
	}
}

export const smsWorker = new Worker<SmsJobData>(
	SMS_QUEUE,
	async (job) => {
		if (job.name === 'member_notification.sms.requested') {
			await processMemberSmsSend(job);
			return;
		}
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
