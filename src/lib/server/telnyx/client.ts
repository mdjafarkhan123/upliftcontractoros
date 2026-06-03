import { createPublicKey, verify as cryptoVerify } from 'crypto';

const env = process.env;

export function telnyxApiKey(): string {
	const key = env.TELNYX_API_KEY;
	if (!key) throw new Error('TELNYX_API_KEY is required.');
	return key;
}

/**
 * Verify a Telnyx webhook signature (Ed25519).
 * Telnyx provides a base64-encoded raw Ed25519 public key (32 bytes).
 * Signed message = `${timestamp}|${rawBody}`
 */
export function verifyTelnyxSignature(
	rawBody: string,
	signature: string,
	timestamp: string
): boolean {
	const pubKeyBase64 = env.TELNYX_PUBLIC_KEY;
	if (!pubKeyBase64) {
		console.warn('[telnyx] TELNYX_PUBLIC_KEY not set — skipping signature check');
		return true; // permissive during initial setup; set key before production
	}
	try {
		// Telnyx sends the raw 32-byte Ed25519 public key as base64.
		// Node's createPublicKey requires DER/SubjectPublicKeyInfo format.
		const rawKey = Buffer.from(pubKeyBase64, 'base64');
		const derPrefix = Buffer.from('302a300506032b6570032100', 'hex');
		const publicKey = createPublicKey({
			key: Buffer.concat([derPrefix, rawKey]),
			format: 'der',
			type: 'spki'
		});
		return cryptoVerify(
			null,
			Buffer.from(`${timestamp}|${rawBody}`),
			publicKey,
			Buffer.from(signature, 'base64')
		);
	} catch {
		return false;
	}
}

/**
 * Build the base URL for constructing absolute webhook URLs.
 * Mirrors the Twilio helper — trusts APP_URL env var first, then forwarded headers.
 */
export function resolveAppUrl(request: Request): string {
	const appUrl = env.APP_URL;
	const u = new URL(request.url);
	if (appUrl) {
		const base = new URL(appUrl);
		return `${base.protocol}//${base.host}`;
	}
	const proto = request.headers.get('x-forwarded-proto') ?? u.protocol.replace(':', '');
	const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? u.host;
	return `${proto}://${host}`;
}
