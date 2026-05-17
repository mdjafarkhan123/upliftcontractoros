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
 * Validate a Twilio webhook signature. The url passed must be the full public URL
 * Twilio used to POST to us (scheme + host + path + query). Returns true if valid.
 *
 * Twilio computes the signature over: url + sorted concatenated POST params.
 * See: https://www.twilio.com/docs/usage/security
 */
export function validateTwilioSignature(
	signatureHeader: string | null,
	url: string,
	params: Record<string, string>
): boolean {
	const token = env.TWILIO_AUTH_TOKEN;
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
