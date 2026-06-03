import { brevoFetch, brevoFetchBinary } from './request';

// Brevo webhook management + inbound attachment download.
//
// Webhooks are created idempotently: Brevo returns 400 when a webhook for the
// same url/type already exists, which we treat as success. The inbound webhook
// is per-org (scoped to the receiving domain); the transactional events webhook
// is account-wide (one per Brevo account).

type CreateWebhookResponse = { id?: number | string };

type BrevoWebhook = {
	id: number | string;
	url: string;
	type: string;
	domain?: string | null;
};

const ALREADY_EXISTS = /already exist|duplicate/i;
// Brevo returns 400 `document_not_found` ("Webhook record does not exist") when
// the account has NO webhooks of the requested type — i.e. an empty list, not an
// error. Treat it as [] so registration can proceed to create the first one.
const NO_WEBHOOKS = /does not exist|not found/i;

async function listWebhooks(type: 'inbound' | 'transactional'): Promise<BrevoWebhook[]> {
	try {
		const data = await brevoFetch<{ webhooks?: BrevoWebhook[] }>(`/webhooks?type=${type}`, {
			method: 'GET'
		});
		return data.webhooks ?? [];
	} catch (err) {
		if (err instanceof Error && NO_WEBHOOKS.test(err.message)) return [];
		throw err;
	}
}

/**
 * Ensure an inbound parse webhook exists for `receivingDomain` pointing at `url`.
 * Returns the Brevo webhook id. Idempotent: reuses an existing matching webhook.
 */
export async function ensureInboundWebhook(
	receivingDomain: string,
	url: string
): Promise<string | null> {
	const existing = (await listWebhooks('inbound')).find(
		(w) => w.url === url || w.domain === receivingDomain
	);
	if (existing) return String(existing.id);

	try {
		const data = await brevoFetch<CreateWebhookResponse>('/webhooks', {
			method: 'POST',
			body: {
				type: 'inbound',
				events: ['inboundEmailProcessed'],
				url,
				domain: receivingDomain,
				description: `Inbound parse — ${receivingDomain}`
			}
		});
		return data.id != null ? String(data.id) : null;
	} catch (err) {
		if (err instanceof Error && ALREADY_EXISTS.test(err.message)) {
			const again = (await listWebhooks('inbound')).find(
				(w) => w.url === url || w.domain === receivingDomain
			);
			return again ? String(again.id) : null;
		}
		throw err;
	}
}

const TRANSACTIONAL_EVENTS = [
	'delivered',
	'hardBounce',
	'softBounce',
	'blocked',
	'spam',
	'invalid',
	'deferred',
	'opened',
	'uniqueOpened'
];

/**
 * Ensure the account-wide transactional events webhook exists, pointing at `url`.
 * Idempotent. Returns the Brevo webhook id.
 */
export async function ensureTransactionalWebhook(url: string): Promise<string | null> {
	const existing = (await listWebhooks('transactional')).find((w) => w.url === url);
	if (existing) return String(existing.id);

	try {
		const data = await brevoFetch<CreateWebhookResponse>('/webhooks', {
			method: 'POST',
			body: {
				type: 'transactional',
				events: TRANSACTIONAL_EVENTS,
				url,
				description: 'Transactional delivery events'
			}
		});
		return data.id != null ? String(data.id) : null;
	} catch (err) {
		if (err instanceof Error && ALREADY_EXISTS.test(err.message)) {
			const again = (await listWebhooks('transactional')).find((w) => w.url === url);
			return again ? String(again.id) : null;
		}
		throw err;
	}
}

/**
 * Delete a webhook by id (used when removing a domain — drops its per-org inbound
 * parse webhook). Idempotent: a webhook that's already gone is treated as success.
 */
export async function deleteWebhook(id: string): Promise<void> {
	try {
		await brevoFetch<unknown>(`/webhooks/${encodeURIComponent(id)}`, { method: 'DELETE' });
	} catch (err) {
		if (err instanceof Error && NO_WEBHOOKS.test(err.message)) return;
		throw err;
	}
}

/** Download an inbound email attachment by its Brevo DownloadToken. */
export async function downloadInboundAttachment(downloadToken: string): Promise<Buffer> {
	return brevoFetchBinary(`/inbound/attachments/${encodeURIComponent(downloadToken)}`);
}
