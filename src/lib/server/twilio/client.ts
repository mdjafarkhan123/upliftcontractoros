import Twilio from 'twilio';
const env = process.env;

let _client: ReturnType<typeof Twilio> | null = null;

export function twilio() {
	if (_client) return _client;
	const sid = env.TWILIO_ACCOUNT_SID;
	const token = env.TWILIO_AUTH_TOKEN;
	if (!sid || !token) throw new Error('TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN are required.');
	_client = Twilio(sid, token);
	return _client;
}

/**
 * Twilio client scoped to send/act as a specific subaccount. With no sid this is
 * the cached master client; with a sid it authenticates using the PARENT
 * credentials + { accountSid: subSid } (the API `--account-sid` pattern), so the
 * message is owned by — and billed/rolled up through — the contractor's
 * subaccount. Not cached: a fresh per-send client is cheap and avoids leaking one
 * subaccount's scope into another's send.
 */
export function twilioFor(subaccountSid?: string | null) {
	if (!subaccountSid) return twilio();
	const sid = env.TWILIO_ACCOUNT_SID;
	const token = env.TWILIO_AUTH_TOKEN;
	if (!sid || !token) throw new Error('TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN are required.');
	return Twilio(sid, token, { accountSid: subaccountSid });
}

/**
 * Validate a Twilio webhook signature. The url passed must be the full public URL
 * Twilio used to POST to us (scheme + host + path + query). Returns true if valid.
 *
 * Twilio computes the signature over: url + sorted concatenated POST params.
 * See: https://www.twilio.com/docs/usage/security
 *
 * `authToken` overrides the master token: inbound webhooks for a number owned by
 * a contractor's subaccount are signed with that SUBACCOUNT's auth token, so the
 * handler passes `org.twilio_subaccount_auth_token` (falling back to master when
 * null = legacy master-owned number). Wrong token → signature never validates.
 */
export function validateTwilioSignature(
	signatureHeader: string | null,
	url: string,
	params: Record<string, string>,
	authToken?: string | null
): boolean {
	const token = authToken ?? env.TWILIO_AUTH_TOKEN;
	if (!token) throw new Error('TWILIO_AUTH_TOKEN is required.');
	if (!signatureHeader) return false;
	return Twilio.validateRequest(token, signatureHeader, url, params);
}

/**
 * Build the exact URL Twilio used when POSTing. Behind a reverse proxy we must
 * trust X-Forwarded-Proto / X-Forwarded-Host (set by Cloudflare / Vercel / etc.).
 * APP_URL overrides everything when set — useful for staging behind tunnels.
 */
export function reconstructWebhookUrl(request: Request): string {
	const appUrl = env.APP_URL;
	const u = new URL(request.url);
	if (appUrl) {
		const base = new URL(appUrl);
		return `${base.protocol}//${base.host}${u.pathname}${u.search}`;
	}
	const proto = request.headers.get('x-forwarded-proto') ?? u.protocol.replace(':', '');
	const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? u.host;
	return `${proto}://${host}${u.pathname}${u.search}`;
}
