import type { RequestHandler } from './$types';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { inboundCommunicationEvents, messages, outboxEvents } from '$lib/server/db/schema';
import { validateTwilioSignature, reconstructWebhookUrl } from '$lib/server/twilio/client';
import { createLogger } from '$lib/server/log';

const log = createLogger('twilio.webhook.status');

/**
 * Forward-only state machine. A late callback must never downgrade a more
 * advanced state (e.g. 'delivered' → 'sent').
 */
const STATE_RANK: Record<string, number> = {
	queued: 1,
	sending: 2,
	sent: 3,
	delivered: 4,
	failed: 5,
	bounced: 5,
	undeliverable: 5,
	received: 0
};

function mapTwilioStatus(s: string): 'queued' | 'sending' | 'sent' | 'delivered' | 'failed' | 'undeliverable' | null {
	switch (s) {
		case 'queued':
		case 'accepted':
		case 'scheduled':
			return 'queued';
		case 'sending':
			return 'sending';
		case 'sent':
			return 'sent';
		case 'delivered':
			return 'delivered';
		case 'failed':
		case 'canceled':
			return 'failed';
		case 'undelivered':
			return 'undeliverable';
		default:
			return null;
	}
}

export const POST: RequestHandler = async ({ request }) => {
	const url = reconstructWebhookUrl(request);
	const form = await request.formData();
	const params: Record<string, string> = {};
	for (const [k, v] of form.entries()) params[k] = typeof v === 'string' ? v : '';

	const signature = request.headers.get('x-twilio-signature');
	if (!validateTwilioSignature(signature, url, params)) {
		return new Response('Invalid signature', { status: 403 });
	}

	const sid = params.MessageSid;
	const twilioStatus = params.MessageStatus;
	if (!sid || !twilioStatus) return new Response(null, { status: 204 });

	const mapped = mapTwilioStatus(twilioStatus);
	if (!mapped) {
		log.info({ phase: 'unhandled_status', status: twilioStatus, sid });
		return new Response(null, { status: 204 });
	}

	const [msg] = await db
		.select()
		.from(messages)
		.where(eq(messages.twilio_message_sid, sid))
		.limit(1);
	if (!msg) {
		log.info({ phase: 'no_message_match', sid, status: twilioStatus });
		return new Response(null, { status: 204 });
	}

	// Per-(sid, status) idempotency — Twilio retries status callbacks.
	const eventKey = `${sid}:${twilioStatus}`;
	const [existing] = await db
		.select({ id: inboundCommunicationEvents.id })
		.from(inboundCommunicationEvents)
		.where(
			and(
				eq(inboundCommunicationEvents.provider, 'twilio'),
				eq(inboundCommunicationEvents.provider_event_id, eventKey)
			)
		)
		.limit(1);
	if (existing) return new Response(null, { status: 204 });

	const now = new Date();
	const currentRank = STATE_RANK[msg.status] ?? 0;
	const nextRank = STATE_RANK[mapped] ?? 0;

	const isFailureState = mapped === 'failed' || mapped === 'undeliverable';
	const wasAlreadyFailure =
		msg.status === 'failed' || msg.status === 'bounced' || msg.status === 'undeliverable';
	// Forward-only — but always allow transitioning into a failure state.
	const shouldUpdate = isFailureState || nextRank > currentRank;
	// Only emit a delivery-failed event when we are entering a failure state for
	// the first time (or for a fresh attempt after retry cleared the prior failure).
	const shouldEmitFailure = isFailureState && shouldUpdate && !wasAlreadyFailure;

	await db.transaction(async (tx) => {
		if (shouldUpdate) {
			const update: Record<string, unknown> = { status: mapped, updated_at: now };
			if (mapped === 'delivered' && !msg.delivered_at) update.delivered_at = now;
			if (mapped === 'failed' || mapped === 'undeliverable') {
				update.failed_at = now;
				const errCode = params.ErrorCode?.trim();
				const errMsg = params.ErrorMessage?.trim();
				update.failure_reason =
					errMsg || (errCode ? `Twilio error ${errCode}` : `Twilio reported ${twilioStatus}`);
			}
			await tx.update(messages).set(update).where(eq(messages.id, msg.id));
		}

		if (shouldEmitFailure) {
			const failureReason =
				params.ErrorMessage?.trim() ||
				(params.ErrorCode?.trim()
					? `Twilio error ${params.ErrorCode.trim()}`
					: `Twilio reported ${twilioStatus}`);
			await tx.insert(outboxEvents).values({
				org_id: msg.org_id,
				event_type: 'message.delivery_failed',
				resource_type: 'message',
				resource_id: msg.id,
				payload: {
					message_id: msg.id,
					conversation_id: msg.conversation_id,
					channel: msg.channel,
					status: mapped,
					is_terminal: mapped === 'undeliverable',
					failure_reason: failureReason,
					sent_by: msg.sent_by,
					failed_at: now.toISOString()
				},
				idempotency_key: `message.delivery_failed:${msg.id}:${now.getTime()}`
			});
		}

		await tx
			.insert(inboundCommunicationEvents)
			.values({
				org_id: msg.org_id,
				provider: 'twilio',
				provider_event_id: eventKey,
				event_type: 'status',
				raw_payload: params,
				processed_at: now
			})
			.onConflictDoNothing();
	});

	return new Response(null, { status: 204 });
};
