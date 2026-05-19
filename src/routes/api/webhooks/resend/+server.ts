import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import {
	inboundCommunicationEvents,
	messages,
	outboxEvents
} from '$lib/server/db/schema';
import { createLogger } from '$lib/server/log';
import { verifySvix } from '$lib/server/email/svixVerify';

const log = createLogger('email.webhook.resend');
const env = process.env;

type ResendEvent = {
	type: string;
	created_at?: string;
	data?: {
		email_id?: string;
		from?: string;
		to?: string[];
		subject?: string;
		bounce?: { type?: string; subType?: string; message?: string };
		click?: { link?: string };
		reason?: string;
	};
};

async function findMessageByProviderId(providerMessageId: string) {
	const [row] = await db
		.select()
		.from(messages)
		.where(
			and(
				eq(messages.email_provider, 'resend'),
				eq(messages.email_provider_message_id, providerMessageId)
			)
		)
		.limit(1);
	return row ?? null;
}

async function alreadyProcessed(svixId: string): Promise<boolean> {
	const [row] = await db
		.select({ id: inboundCommunicationEvents.id })
		.from(inboundCommunicationEvents)
		.where(
			and(
				eq(inboundCommunicationEvents.provider, 'resend'),
				eq(inboundCommunicationEvents.provider_event_id, svixId)
			)
		)
		.limit(1);
	return Boolean(row);
}

type FailureTransition = {
	nextStatus: 'failed' | 'bounced' | 'undeliverable';
	failureReason: string;
	isTerminal: boolean;
};

async function applyEvent(event: ResendEvent, svixId: string): Promise<void> {
	const providerId = event.data?.email_id;
	if (!providerId) {
		log.warn({ phase: 'no_email_id', type: event.type });
		return;
	}

	const msg = await findMessageByProviderId(providerId);
	if (!msg) {
		log.info({ phase: 'no_message_match', provider_id: providerId, type: event.type });
		return;
	}

	const now = new Date();
	const wasAlreadyFailure =
		msg.status === 'failed' || msg.status === 'bounced' || msg.status === 'undeliverable';
	let failure: FailureTransition | null = null;
	let messageUpdate: Record<string, unknown> | null = null;

	switch (event.type) {
		case 'email.sent':
			// We already set 'sent' when the worker accepted the Resend response.
			break;

		case 'email.delivered':
			// Forward-only: never overwrite a terminal failure state with 'delivered'.
			if (msg.status === 'sent' || msg.status === 'sending' || msg.status === 'queued') {
				messageUpdate = { status: 'delivered', delivered_at: now, updated_at: now };
			}
			break;

		case 'email.opened':
			// Opens can land after a failure event; record the open timestamp but do
			// not change status away from a failure/terminal state.
			if (!msg.opened_at) {
				messageUpdate = { opened_at: now, updated_at: now };
			}
			break;

		case 'email.bounced': {
			if (!wasAlreadyFailure) {
				const isPermanent = event.data?.bounce?.type?.toLowerCase().includes('permanent');
				const failureReason = event.data?.bounce?.message ?? 'Bounced';
				messageUpdate = {
					status: 'bounced',
					bounced_at: now,
					failed_at: now,
					bounce_type: isPermanent ? 'hard' : 'soft',
					failure_reason: failureReason,
					updated_at: now
				};
				failure = { nextStatus: 'bounced', failureReason, isTerminal: true };
			}
			break;
		}

		case 'email.complained':
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

		case 'email.failed':
			if (!wasAlreadyFailure) {
				const failureReason = event.data?.reason ?? 'Provider reported failure';
				messageUpdate = {
					status: 'failed',
					failure_reason: failureReason,
					failed_at: now,
					updated_at: now
				};
				failure = { nextStatus: 'failed', failureReason, isTerminal: false };
			}
			break;

		case 'email.delivery_delayed':
			messageUpdate = {
				failure_reason: event.data?.reason ?? 'Delivery delayed',
				updated_at: now
			};
			break;

		case 'email.clicked':
			// Open derivation only — no schema change needed.
			break;

		default:
			log.info({ phase: 'unhandled_event', type: event.type });
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
				provider: 'resend',
				provider_event_id: svixId,
				event_type: event.type,
				raw_payload: event as object,
				processed_at: new Date()
			})
			.onConflictDoNothing();
	});

}

export const POST: RequestHandler = async (event) => {
	const secret = env.RESEND_WEBHOOK_SECRET;
	if (!secret) {
		log.error({ phase: 'missing_secret' });
		return json({ error: 'Webhook not configured.' }, { status: 500 });
	}

	const rawBody = await event.request.text();
	const verified = verifySvix(rawBody, event.request.headers, secret);
	if (!verified.ok) {
		log.warn({ phase: 'invalid_signature', reason: verified.reason });
		return json({ error: 'Invalid signature.' }, { status: 401 });
	}
	const svixId = verified.svixId;

	if (await alreadyProcessed(svixId)) {
		return new Response(null, { status: 204 });
	}

	let parsed: ResendEvent;
	try {
		parsed = JSON.parse(rawBody) as ResendEvent;
	} catch {
		return json({ error: 'Invalid JSON.' }, { status: 400 });
	}

	try {
		await applyEvent(parsed, svixId);
	} catch (err) {
		log.error({
			phase: 'apply_failed',
			svix_id: svixId,
			type: parsed.type,
			error: err instanceof Error ? err.message : String(err)
		});
		return json({ error: 'Failed to process event.' }, { status: 500 });
	}

	return new Response(null, { status: 204 });
};
