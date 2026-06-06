import { createHmac } from 'node:crypto';
import { messengerGraphVersion, metaAppId, metaAppSecret, messengerRedirectUri } from './client';

// Thin server-to-server wrapper over the Meta Graph API used by the Facebook
// Login connect flow (Stage 3) and, later, outbound sends (Stage 5). Tokens are
// secrets — they are never logged, never returned to the browser, never thrown
// inside an error message.

const graphApiBase = () => `https://graph.facebook.com/${messengerGraphVersion()}`;

/** Typed Graph failure so callers can branch/log without inspecting raw JSON. */
export class GraphApiError extends Error {
	constructor(
		message: string,
		readonly status: number,
		readonly fbType?: string,
		readonly fbCode?: number,
		readonly fbTraceId?: string,
		readonly fbSubcode?: number
	) {
		super(message);
		this.name = 'GraphApiError';
	}
}

/**
 * The customer hasn't messaged in >24h, so a standard `RESPONSE` send is no
 * longer allowed by Meta's messaging window. Meta surfaces this as error
 * code 10 / subcode 2018278 ("This message is sent outside of allowed window").
 * Classified as PERMANENT so the worker fails fast instead of burning retries
 * on a send that can only succeed via a (paid) message tag we don't use.
 */
export function isMessengerWindowError(err: unknown): boolean {
	if (!(err instanceof GraphApiError)) return false;
	if (err.fbSubcode === 2018278) return true;
	if (err.fbCode === 10 && /outside of (the )?allowed window/i.test(err.message)) return true;
	return false;
}

/**
 * Send failures Meta will never accept on retry: a bad/blocked recipient, a
 * revoked Page permission, or the 24h window. 4xx OAuth/permission errors
 * (codes 10, 100, 190, 200, 230) are permanent; everything else (5xx, network,
 * rate limit) is left transient so BullMQ retries.
 */
export function isPermanentSendError(err: unknown): boolean {
	if (isMessengerWindowError(err)) return true;
	if (!(err instanceof GraphApiError)) return false;
	const permanentCodes = new Set([10, 100, 190, 200, 230]);
	if (typeof err.fbCode === 'number' && permanentCodes.has(err.fbCode)) return true;
	return false;
}

/**
 * `appsecret_proof = HMAC-SHA256(access_token, app_secret)` (hex). Meta requires
 * it on token-authenticated Graph calls when "Require App Secret" is enabled and
 * accepts it otherwise — so we attach it to every call that carries a token.
 */
export function appSecretProof(accessToken: string): string {
	return createHmac('sha256', metaAppSecret()).update(accessToken).digest('hex');
}

async function toGraphError(res: Response): Promise<GraphApiError> {
	let message = `Graph API request failed (${res.status}).`;
	let fbType: string | undefined;
	let fbCode: number | undefined;
	let fbTraceId: string | undefined;
	let fbSubcode: number | undefined;
	try {
		const body = (await res.json()) as {
			error?: {
				message?: string;
				type?: string;
				code?: number;
				error_subcode?: number;
				fbtrace_id?: string;
			};
		};
		if (body.error) {
			message = body.error.message ?? message;
			fbType = body.error.type;
			fbCode = body.error.code;
			fbSubcode = body.error.error_subcode;
			fbTraceId = body.error.fbtrace_id;
		}
	} catch {
		// Non-JSON error body — keep the status-based message.
	}
	return new GraphApiError(message, res.status, fbType, fbCode, fbTraceId, fbSubcode);
}

type TokenResponse = { access_token?: string; token_type?: string; expires_in?: number };

/**
 * Exchange the OAuth `code` from the callback for a short-lived user access
 * token. Authenticated by `client_secret`, so no `appsecret_proof` applies.
 */
export async function exchangeCodeForUserToken(code: string): Promise<string> {
	const url = new URL(`${graphApiBase()}/oauth/access_token`);
	url.searchParams.set('client_id', metaAppId());
	url.searchParams.set('redirect_uri', messengerRedirectUri());
	url.searchParams.set('client_secret', metaAppSecret());
	url.searchParams.set('code', code);

	const res = await fetch(url, { method: 'GET' });
	if (!res.ok) throw await toGraphError(res);
	const data = (await res.json()) as TokenResponse;
	if (!data.access_token) throw new GraphApiError('Code exchange returned no token.', res.status);
	return data.access_token;
}

/**
 * Exchange a short-lived user token for a long-lived (~60 day) one. Page tokens
 * derived from a long-lived user token do not expire, which is what we persist.
 */
export async function exchangeForLongLivedUserToken(shortLivedToken: string): Promise<string> {
	const url = new URL(`${graphApiBase()}/oauth/access_token`);
	url.searchParams.set('grant_type', 'fb_exchange_token');
	url.searchParams.set('client_id', metaAppId());
	url.searchParams.set('client_secret', metaAppSecret());
	url.searchParams.set('fb_exchange_token', shortLivedToken);

	const res = await fetch(url, { method: 'GET' });
	if (!res.ok) throw await toGraphError(res);
	const data = (await res.json()) as TokenResponse;
	if (!data.access_token) throw new GraphApiError('Token exchange returned no token.', res.status);
	return data.access_token;
}

export type ManagedPage = { id: string; name: string; access_token: string };

/**
 * List the Pages the authenticated user manages, each with its own Page access
 * token. Pages missing an id or token (insufficient role) are dropped.
 */
export async function listManagedPages(userToken: string): Promise<ManagedPage[]> {
	const url = new URL(`${graphApiBase()}/me/accounts`);
	url.searchParams.set('fields', 'id,name,access_token');
	url.searchParams.set('access_token', userToken);
	url.searchParams.set('appsecret_proof', appSecretProof(userToken));

	const res = await fetch(url, { method: 'GET' });
	if (!res.ok) throw await toGraphError(res);
	const data = (await res.json()) as { data?: Array<Partial<ManagedPage>> };
	return (data.data ?? [])
		.filter((p): p is ManagedPage => Boolean(p.id && p.access_token))
		.map((p) => ({ id: p.id, name: p.name ?? p.id, access_token: p.access_token }));
}

/**
 * Subscribe this app to the Page's `messages` webhook field so inbound DMs start
 * arriving at /api/webhooks/messenger. Uses the PAGE token. Idempotent on Meta's
 * side — re-subscribing an already-subscribed page is a no-op success.
 */
export async function subscribePageToApp(pageId: string, pageToken: string): Promise<void> {
	const res = await fetch(`${graphApiBase()}/${pageId}/subscribed_apps`, {
		method: 'POST',
		headers: { 'content-type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			subscribed_fields: 'messages',
			access_token: pageToken,
			appsecret_proof: appSecretProof(pageToken)
		})
	});
	if (!res.ok) throw await toGraphError(res);
	const data = (await res.json()) as { success?: boolean };
	if (!data.success) throw new GraphApiError('Page subscription was not confirmed.', res.status);
}

/**
 * Remove this app's webhook subscription from the Page on disconnect. Best-effort
 * — the caller treats failure as non-fatal (the local row is the source of truth).
 */
export async function unsubscribePageFromApp(pageId: string, pageToken: string): Promise<void> {
	const url = new URL(`${graphApiBase()}/${pageId}/subscribed_apps`);
	url.searchParams.set('access_token', pageToken);
	url.searchParams.set('appsecret_proof', appSecretProof(pageToken));

	const res = await fetch(url, { method: 'DELETE' });
	if (!res.ok) throw await toGraphError(res);
}

export type MessengerUserProfile = { first_name?: string; last_name?: string };

/**
 * Fetch a Messenger user's public profile (first/last name) by PSID using the
 * Page access token. The PSID is page-scoped, so the token MUST belong to the
 * same Page the message arrived on.
 *
 * Best-effort by design: returns null on ANY failure (Graph error, network,
 * non-JSON, user with limited profile) so inbound normalization can fall back to
 * a placeholder name rather than dropping the customer's message. Never throws.
 *
 * https://developers.facebook.com/docs/messenger-platform/identity/user-profile
 */
export async function getUserProfile(
	pageToken: string,
	psid: string
): Promise<MessengerUserProfile | null> {
	try {
		const url = new URL(`${graphApiBase()}/${psid}`);
		url.searchParams.set('fields', 'first_name,last_name');
		url.searchParams.set('access_token', pageToken);
		url.searchParams.set('appsecret_proof', appSecretProof(pageToken));

		const res = await fetch(url, { method: 'GET' });
		if (!res.ok) return null;
		const data = (await res.json()) as { first_name?: string; last_name?: string };
		return { first_name: data.first_name, last_name: data.last_name };
	} catch {
		return null;
	}
}

/**
 * Send a plain-text outbound message to a Messenger user (PSID) from the Page.
 *
 * Uses `messaging_type: 'RESPONSE'` — a reply inside Meta's 24h standard
 * messaging window. Sends outside that window are rejected by Meta with the
 * window error (see `isMessengerWindowError`); we do NOT use message tags.
 * Authenticated by the PAGE token (+ appsecret_proof). Returns Meta's
 * `message_id` for the send (not persisted in Stage 5, but logged/usable for
 * future delivery-receipt correlation). Throws GraphApiError on any failure.
 *
 * https://developers.facebook.com/docs/messenger-platform/send-messages
 */
export async function sendTextMessage(
	pageToken: string,
	psid: string,
	text: string
): Promise<string> {
	const url = new URL(`${graphApiBase()}/me/messages`);
	url.searchParams.set('access_token', pageToken);
	url.searchParams.set('appsecret_proof', appSecretProof(pageToken));

	const res = await fetch(url, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			messaging_type: 'RESPONSE',
			recipient: { id: psid },
			message: { text }
		})
	});
	if (!res.ok) throw await toGraphError(res);
	const data = (await res.json()) as { message_id?: string };
	if (!data.message_id) throw new GraphApiError('Send returned no message_id.', res.status);
	return data.message_id;
}
