import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { inboundCommunicationEvents } from '$lib/server/db/schema';
import { createLogger } from '$lib/server/log';
import { verifySvix } from '$lib/server/email/svixVerify';
import {
	processInboundEmail,
	type ResendInboundEvent
} from '$lib/server/email/inboundProcessor';

const log = createLogger('email.webhook.inbound');
const env = process.env;

async function alreadyProcessed(svixId: string): Promise<boolean> {
	const [row] = await db
		.select({ id: inboundCommunicationEvents.id })
		.from(inboundCommunicationEvents)
		.where(
			and(
				eq(inboundCommunicationEvents.provider, 'resend_inbound'),
				eq(inboundCommunicationEvents.provider_event_id, svixId)
			)
		)
		.limit(1);
	return Boolean(row);
}

export const POST: RequestHandler = async (event) => {
	const secret = env.RESEND_INBOUND_WEBHOOK_SECRET;
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

	let parsed: ResendInboundEvent;
	try {
		parsed = JSON.parse(rawBody) as ResendInboundEvent;
	} catch {
		return json({ error: 'Invalid JSON.' }, { status: 400 });
	}

	const type = parsed.type ?? '';
	if (type && type !== 'email.received' && type !== 'inbound.email.received') {
		log.info({ phase: 'unhandled_type', type, svix_id: svixId });
		return new Response(null, { status: 204 });
	}

	try {
		await processInboundEmail({ svixId, event: parsed });
	} catch (err) {
		log.error({
			phase: 'process_failed',
			svix_id: svixId,
			error: err instanceof Error ? err.message : String(err)
		});
		// Return 500 so Resend retries — the audit row written on failure carries
		// `error` set, and is keyed by svix-id so re-delivery short-circuits via
		// the alreadyProcessed() check above only when we previously succeeded.
		return json({ error: 'Failed to process inbound email.' }, { status: 500 });
	}

	return new Response(null, { status: 204 });
};
