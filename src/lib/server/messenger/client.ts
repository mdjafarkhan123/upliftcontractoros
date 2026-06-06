import { createHmac, timingSafeEqual } from 'node:crypto';

const env = process.env;

/**
 * Meta App secret — used to verify the `X-Hub-Signature-256` HMAC on inbound
 * webhooks and (later) to derive app proofs for Graph API calls. Secret.
 */
export function metaAppSecret(): string {
	const secret = env.META_APP_SECRET;
	if (!secret) throw new Error('META_APP_SECRET is required.');
	return secret;
}

/**
 * Shared verify token configured on the Meta App webhook product. Meta echoes it
 * back on the GET verification handshake; we compare and return the challenge.
 */
export function messengerVerifyToken(): string {
	const token = env.MESSENGER_VERIFY_TOKEN;
	if (!token) throw new Error('MESSENGER_VERIFY_TOKEN is required.');
	return token;
}

/**
 * Graph API version used for outbound sends (e.g. "v21.0"). Defaults to a known
 * stable version so a missing env var doesn't break inbound; outbound (Stage 5)
 * is the only consumer that actually needs it pinned.
 */
export function messengerGraphVersion(): string {
	return env.MESSENGER_GRAPH_VERSION ?? 'v21.0';
}

/**
 * Meta App id (the public OAuth client id). Used to build the Facebook Login
 * dialog URL and to exchange the OAuth `code` for an access token.
 */
export function metaAppId(): string {
	const id = env.META_APP_ID;
	if (!id) throw new Error('META_APP_ID is required.');
	return id;
}

/**
 * Public base URL of this app (e.g. "https://app.example.com"), trailing slash
 * stripped. Source for the OAuth `redirect_uri` and any absolute links we hand
 * to Meta.
 */
export function appBaseUrl(): string {
	const url = env.APP_URL;
	if (!url) throw new Error('APP_URL is required.');
	return url.replace(/\/+$/, '');
}

/**
 * The single OAuth callback Meta redirects to after the Login dialog. This MUST
 * match a "Valid OAuth Redirect URI" configured on the Meta App exactly.
 */
export function messengerRedirectUri(): string {
	return `${appBaseUrl()}/api/settings/messenger/callback`;
}

/**
 * Verify the `X-Hub-Signature-256` header Meta sends on every webhook POST.
 *
 * Meta computes `sha256=` + HMAC-SHA256(rawBody, app_secret). We MUST hash the
 * exact raw request body (never the re-serialized JSON) and compare in constant
 * time. Returns false for a missing/malformed header or any mismatch.
 *
 * See: https://developers.facebook.com/docs/messenger-platform/webhooks#validate-payloads
 */
export function verifyMessengerSignature(rawBody: string, signatureHeader: string | null): boolean {
	if (!signatureHeader || !signatureHeader.startsWith('sha256=')) return false;

	const provided = signatureHeader.slice('sha256='.length);
	const expected = createHmac('sha256', metaAppSecret()).update(rawBody, 'utf8').digest('hex');

	const providedBuf = Buffer.from(provided, 'hex');
	const expectedBuf = Buffer.from(expected, 'hex');
	// Length guard: timingSafeEqual throws on unequal lengths.
	if (providedBuf.length !== expectedBuf.length) return false;
	return timingSafeEqual(providedBuf, expectedBuf);
}
