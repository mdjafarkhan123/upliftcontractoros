/**
 * POST /api/webhooks/brevo/events/{secret}
 *
 * Brevo transactional delivery-events webhook (account-wide — one per Brevo
 * account). Brevo's payload carries no signature, so the path {secret} is the
 * authentication. Events advance message status FORWARD-ONLY, mirroring the
 * delivery-tracking the Resend events webhook used to provide.
 *
 * Note: webhook payload event names are snake_case (`hard_bounce`,
 * `unique_opened`), distinct from the camelCase names used when REGISTERING the
 * webhook (`hardBounce`, `uniqueOpened`).
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { inboundCommunicationEvents, messages, outboxEvents } from '$lib/server/db/schema';
import { createLogger } from '$lib/server/log';

const log = createLogger('email.webhook.brevo.events');
const env = process.env;

type BrevoEvent = {
	event?: string;
	'message-id'?: string;
	message_id?: string;
	email?: string;
	reason?: string;
	date?: string;
	ts?: number;
};

function messageIdVariants(raw: string): string[] {
	const stripped = raw.replace(/^<|>$/g, '');
	return Array.from(new Set([raw, stripped, `<${stripped}>`]));
}

async function findMessage(providerMessageId: string) {
	const [row] = await db
		.select()
		.from(messages)
		.where(
			and(
				eq(messages.email_provider, 'brevo'),
				inArray(messages.email_provider_message_id, messageIdVariants(providerMessageId))
			)
		)
		.limit(1);
	return row ?? null;
}

type FailureTransition = {
	nextStatus: 'failed' | 'bounced' | 'undeliverable';
	failureReason: string;
	isTerminal: boolean;
};

async function applyEvent(event: BrevoEvent): Promise<void> {
	const providerId = event['message-id'] ?? event.message_id;
	if (!providerId) {
		log.warn({ phase: 'no_message_id', type: event.event });
		return;
	}

	const msg = await findMessage(providerId);
	if (!msg) {
		log.info({ phase: 'no_message_match', provider_id: providerId, type: event.event });
		return;
	}

	// Idempotency key — Brevo has no per-event id, so derive a stable one.
	const eventKey = `${event.event ?? 'event'}:${providerId}:${event.ts ?? event.date ?? ''}`;
	const [seen] = await db
		.select({ id: inboundCommunicationEvents.id })
		.from(inboundCommunicationEvents)
		.where(
			and(
				eq(inboundCommunicationEvents.provider, 'brevo'),
				eq(inboundCommunicationEvents.provider_event_id, eventKey)
			)
		)
		.limit(1);
	if (seen) return;

	const now = new Date();
	const wasAlreadyFailure =
		msg.status === 'failed' || msg.status === 'bounced' || msg.status === 'undeliverable';
	let failure: FailureTransition | null = null;
	let messageUpdate: Record<string, unknown> | null = null;

	switch (event.event) {
		case 'delivered':
			if (msg.status === 'sent' || msg.status === 'sending' || msg.status === 'queued') {
				messageUpdate = { status: 'delivered', delivered_at: now, updated_at: now };
			}
			break;

		case 'opened':
		case 'unique_opened':
			if (!msg.opened_at) messageUpdate = { opened_at: now, updated_at: now };
			break;

		case 'hard_bounce':
			if (!wasAlreadyFailure) {
				const failureReason = event.reason ?? 'Hard bounce';
				messageUpdate = {
					status: 'bounced',
					bounced_at: now,
					failed_at: now,
					bounce_type: 'hard',
					failure_reason: failureReason,
					updated_at: now
				};
				failure = { nextStatus: 'bounced', failureReason, isTerminal: true };
			}
			break;

		case 'soft_bounce':
			if (!wasAlreadyFailure) {
				const failureReason = event.reason ?? 'Soft bounce';
				messageUpdate = {
					status: 'bounced',
					bounced_at: now,
					failed_at: now,
					bounce_type: 'soft',
					failure_reason: failureReason,
					updated_at: now
				};
				failure = { nextStatus: 'bounced', failureReason, isTerminal: true };
			}
			break;

		case 'spam':
			if (!wasAlreadyFailure) {
				const failureReason = 'Recipient marked as spam';
				messageUpdate = {
					status: 'undeliverable',
					failed_at: now,
					failure_reason: failureReason,
					updated_at: now
				};
				failure = { nextStatus: 'undeliverable', failureReason, isTerminal: true };
			}
			break;

		case 'blocked':
		case 'invalid_email':
			if (!wasAlreadyFailure) {
				const failureReason = event.reason ?? 'Recipient blocked or invalid';
				messageUpdate = {
					status: 'undeliverable',
					failed_at: now,
					failure_reason: failureReason,
					updated_at: now
				};
				failure = { nextStatus: 'undeliverable', failureReason, isTerminal: true };
			}
			break;

		case 'deferred':
			messageUpdate = { failure_reason: event.reason ?? 'Delivery deferred', updated_at: now };
			break;

		default:
			// request / sent / click and any unknown events — no status change.
			log.info({ phase: 'unhandled_event', type: event.event });
	}

	await db.transaction(async (tx) => {
		if (messageUpdate) {
			await tx.update(messages).set(messageUpdate).where(eq(messages.id, msg.id));
		}

		if (failure) {
			await tx.insert(outboxEvents).values({
				org_id: msg.org_id,
				event_type: 'message.delivery_failed',
				resource_type: 'message',
				resource_id: msg.id,
				payload: {
					message_id: msg.id,
					conversation_id: msg.conversation_id,
					channel: msg.channel,
					status: failure.nextStatus,
					is_terminal: failure.isTerminal,
					failure_reason: failure.failureReason,
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
				provider: 'brevo',
				provider_event_id: eventKey,
				event_type: event.event ?? 'event',
				raw_payload: event as object,
				processed_at: new Date()
			})
			.onConflictDoNothing();
	});
}

export const POST: RequestHandler = async ({ params, request }) => {
	const secret = env.BREVO_EVENTS_WEBHOOK_SECRET;
	if (!secret) {
		log.error({ phase: 'missing_secret' });
		return json({ error: 'Webhook not configured.' }, { status: 500 });
	}
	if (params.secret !== secret) {
		log.warn({ phase: 'invalid_secret' });
		return json({ error: 'Invalid secret.' }, { status: 401 });
	}

	let parsed: BrevoEvent;
	try {
		parsed = (await request.json()) as BrevoEvent;
	} catch {
		return json({ error: 'Invalid JSON.' }, { status: 400 });
	}

	try {
		await applyEvent(parsed);
	} catch (err) {
		log.error({
			phase: 'apply_failed',
			type: parsed.event,
			error: err instanceof Error ? err.message : String(err)
		});
		return json({ error: 'Failed to process event.' }, { status: 500 });
	}

	return new Response(null, { status: 204 });
};
