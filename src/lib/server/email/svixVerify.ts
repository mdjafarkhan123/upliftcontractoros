import { createHmac, timingSafeEqual } from 'node:crypto';

const MAX_TIMESTAMP_SKEW_SECONDS = 5 * 60;

export type SvixVerifyResult =
	| { ok: true; svixId: string }
	| { ok: false; reason: 'missing_headers' | 'bad_timestamp' | 'stale' | 'invalid_signature' };

/**
 * Verify a Svix-style signed webhook (used by Resend for both outbound
 * delivery events and inbound mail). The secret is the `whsec_<base64>` form
 * shown in the Resend dashboard.
 */
export function verifySvix(
	rawBody: string,
	headers: Headers,
	secret: string
): SvixVerifyResult {
	const id = headers.get('svix-id');
	const timestamp = headers.get('svix-timestamp');
	const signature = headers.get('svix-signature');
	if (!id || !timestamp || !signature) return { ok: false, reason: 'missing_headers' };

	const tsNum = Number(timestamp);
	if (!Number.isFinite(tsNum)) return { ok: false, reason: 'bad_timestamp' };
	if (Math.abs(Math.floor(Date.now() / 1000) - tsNum) > MAX_TIMESTAMP_SKEW_SECONDS) {
		return { ok: false, reason: 'stale' };
	}

	const secretBytes = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
	const signed = `${id}.${timestamp}.${rawBody}`;
	const expected = createHmac('sha256', secretBytes).update(signed).digest('base64');

	for (const part of signature.split(' ')) {
		const [, sig] = part.split(',');
		if (!sig) continue;
		const a = Buffer.from(sig, 'utf8');
		const b = Buffer.from(expected, 'utf8');
		if (a.length === b.length && timingSafeEqual(a, b)) {
			return { ok: true, svixId: id };
		}
	}
	return { ok: false, reason: 'invalid_signature' };
}
