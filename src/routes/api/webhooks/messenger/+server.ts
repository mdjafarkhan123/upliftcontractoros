import { and, eq, isNull } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import {
	inboundCommunicationEvents,
	messengerIntegrations,
	organizations
} from '$lib/server/db/schema';
import { messengerVerifyToken, verifyMessengerSignature } from '$lib/server/messenger/client';
import { processMessengerEntry } from '$lib/server/messenger/inbound';

// Meta requires a fast 2xx ack on every delivery, otherwise it retries the batch
// and eventually disables the subscription. We resolve the org, audit the raw
// payload, normalize the messages, then ack. A genuine persist failure is allowed
// to propagate (→ non-200) so Meta redelivers; messenger_mid dedup makes that safe.
const ACK = new Response('EVENT_RECEIVED', { status: 200 });

/**
 * Webhook verification handshake. Meta calls this once when the webhook URL is
 * configured (and on re-verify). Echo `hub.challenge` only when the mode is
 * `subscribe` and the shared verify token matches; otherwise 403.
 */
export const GET: RequestHandler = async ({ url }) => {
	const mode = url.searchParams.get('hub.mode');
	const token = url.searchParams.get('hub.verify_token');
	const challenge = url.searchParams.get('hub.challenge');

	if (mode === 'subscribe' && challenge && token === messengerVerifyToken()) {
		return new Response(challenge, {
			status: 200,
			headers: { 'content-type': 'text/plain' }
		});
	}
	return new Response('Forbidden', { status: 403 });
};

type MessengerWebhookBody = {
	object?: string;
	entry?: Array<{
		id?: string;
		time?: number;
		messaging?: unknown[];
	}>;
};

export const POST: RequestHandler = async ({ request }) => {
	// Read the raw body BEFORE parsing — the HMAC is computed over these exact bytes.
	const rawBody = await request.text();

	if (!verifyMessengerSignature(rawBody, request.headers.get('x-hub-signature-256'))) {
		return new Response('Invalid signature', { status: 403 });
	}

	let body: MessengerWebhookBody;
	try {
		body = JSON.parse(rawBody);
	} catch {
		// Signature was valid but body isn't JSON — ack so Meta stops retrying.
		return ACK;
	}

	// Only page-subscribed events carry Messenger conversations.
	if (body.object !== 'page' || !Array.isArray(body.entry)) return ACK;

	for (const entry of body.entry) {
		const pageId = entry?.id;
		if (!pageId) continue;

		// entry.id (the Page id) is the canonical routing key → org.
		const [row] = await db
			.select({
				orgId: messengerIntegrations.org_id,
				pageAccessToken: messengerIntegrations.page_access_token,
				featureMessenger: organizations.feature_messenger
			})
			.from(messengerIntegrations)
			.innerJoin(organizations, eq(organizations.id, messengerIntegrations.org_id))
			.where(
				and(
					eq(messengerIntegrations.page_id, pageId),
					eq(messengerIntegrations.status, 'connected'),
					isNull(messengerIntegrations.deleted_at)
				)
			)
			.limit(1);

		// Unknown / disconnected page, or org without the feature flag → ignore.
		if (!row || !row.featureMessenger) continue;

		// Audit the raw entry (best-effort — never blocks the ack). Written before
		// normalization so the payload is recoverable even if a redelivery is needed.
		void db
			.insert(inboundCommunicationEvents)
			.values({
				org_id: row.orgId,
				provider: 'messenger',
				provider_event_id: pageId,
				event_type: 'messenger',
				raw_payload: entry as Record<string, unknown>,
				processed_at: new Date()
			})
			.catch(() => undefined);

		// Normalize entry.messaging[] → contacts / messages / conversations + a
		// message.received outbox event. Awaited so a persist failure surfaces as a
		// non-200 (Meta redelivers); inbound dedup is keyed on messages.messenger_mid.
		if (Array.isArray(entry.messaging) && entry.messaging.length > 0) {
			await processMessengerEntry({
				orgId: row.orgId,
				pageId,
				pageAccessToken: row.pageAccessToken,
				messaging: entry.messaging
			});
		}
	}

	return ACK;
};
