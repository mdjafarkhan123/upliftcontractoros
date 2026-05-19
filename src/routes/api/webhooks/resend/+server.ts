import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { and, eq } from 'drizzle-orm';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { db } from '$lib/server/db/client';
import {
	inboundCommunicationEvents,
	messages
} from '$lib/server/db/schema';
import { createLogger } from '$lib/server/log';

const log = createLogger('email.webhook.resend');
const env = process.env;

const MAX_TIMESTAMP_SKEW_SECONDS = 5 * 60;

function verifySvixSignature(
	rawBody: string,
	headers: Headers,
	secret: string
): boolean {
	const id = headers.get('svix-id');
	const timestamp = headers.get('svix-timestamp');
	const signature = headers.get('svix-signature');
	if (!id || !timestamp || !signature) return false;

	const tsNum = Number(timestamp);
	if (!Number.isFinite(tsNum)) return false;
	if (Math.abs(Math.floor(Date.now() / 1000) - tsNum) > MAX_TIMESTAMP_SKEW_SECONDS) {
		return false;
	}

	const secretBytes = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
	const signed = `${id}.${timestamp}.${rawBody}`;
	const expected = createHmac('sha256', secretBytes).update(signed).digest('base64');

	// Header carries one or more `v1,<sig>` entries separated by spaces.
	for (const part of signature.split(' ')) {
		const [, sig] = part.split(',');
		if (!sig) continue;
		const a = Buffer.from(sig, 'utf8');
		const b = Buffer.from(expected, 'utf8');
		if (a.length === b.length && timingSafeEqual(a, b)) return true;
	}
	return false;
}

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

async function recordAudit(
	orgId: string,
	svixId: string,
	eventType: string,
	payload: unknown
) {
	await db
		.insert(inboundCommunicationEvents)
		.values({
			org_id: orgId,
			provider: 'resend',
			provider_event_id: svixId,
			event_type: eventType,
			raw_payload: payload as object,
			processed_at: new Date()
		})
		.onConflictDoNothing();
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
	switch (event.type) {
		case 'email.sent':
			// We already set 'sent' when the worker accepted the Resend response.
			break;

		case 'email.delivered':
			if (msg.status === 'sent' || msg.status === 'sending' || msg.status === 'queued') {
				await db
					.update(messages)
					.set({ status: 'delivered', delivered_at: now, updated_at: now })
					.where(eq(messages.id, msg.id));
			}
			break;

		case 'email.opened':
			if (!msg.opened_at) {
				await db
					.update(messages)
					.set({ opened_at: now, updated_at: now })
					.where(eq(messages.id, msg.id));
			}
			break;

		case 'email.bounced': {
			const isPermanent = event.data?.bounce?.type?.toLowerCase().includes('permanent');
			await db
				.update(messages)
				.set({
					status: 'bounced',
					bounced_at: now,
					bounce_type: isPermanent ? 'hard' : 'soft',
					failure_reason: event.data?.bounce?.message ?? 'Bounced',
					updated_at: now
				})
				.where(eq(messages.id, msg.id));
			break;
		}

		case 'email.complained':
			await db
				.update(messages)
				.set({
					status: 'undeliverable',
					failure_reason: 'Recipient marked as spam',
					updated_at: now
				})
				.where(eq(messages.id, msg.id));
			break;

		case 'email.failed':
			await db
				.update(messages)
				.set({
					status: 'failed',
					failure_reason: event.data?.reason ?? 'Provider reported failure',
					failed_at: now,
					updated_at: now
				})
				.where(eq(messages.id, msg.id));
			break;

		case 'email.delivery_delayed':
			await db
				.update(messages)
				.set({
					failure_reason: event.data?.reason ?? 'Delivery delayed',
					updated_at: now
				})
				.where(eq(messages.id, msg.id));
			break;

		case 'email.clicked':
			// Open derivation only — no schema change needed.
			break;

		default:
			log.info({ phase: 'unhandled_event', type: event.type });
	}

	await recordAudit(msg.org_id, svixId, event.type, event);
}

export const POST: RequestHandler = async (event) => {
	const secret = env.RESEND_WEBHOOK_SECRET;
	if (!secret) {
		log.error({ phase: 'missing_secret' });
		return json({ error: 'Webhook not configured.' }, { status: 500 });
	}

	const rawBody = await event.request.text();
	if (!verifySvixSignature(rawBody, event.request.headers, secret)) {
		log.warn({ phase: 'invalid_signature' });
		return json({ error: 'Invalid signature.' }, { status: 401 });
	}

	const svixId = event.request.headers.get('svix-id');
	if (!svixId) return json({ error: 'Missing svix-id.' }, { status: 400 });

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
