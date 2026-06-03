// Signed token for customer self-serve reschedule/cancel links.
//
// Format:    base64url(payloadJSON).base64url(hmacSha256(payloadJSON))
// Algorithm: HMAC-SHA256 with APPOINTMENT_MANAGE_SECRET.
//
// The token IS the auth on the public manage page. Security model:
//   - Server-only secret — tokens cannot be forged.
//   - Constant-time HMAC comparison via timingSafeEqual.
//   - Embedded updatedAtEpoch ties the token to the appointment's current
//     revision. Any subsequent mutation bumps updated_at and invalidates every
//     outstanding link.
//   - Embedded exp expires the token one hour after scheduled_start.
//
// Invalid / expired / stale tokens must surface as a generic 404 at the route
// boundary — never disclose appointment existence.

import { createHmac, timingSafeEqual } from 'node:crypto';

const env = process.env;

function getSecret(): string {
	const secret = env.APPOINTMENT_MANAGE_SECRET;
	if (!secret || secret.length < 16) {
		throw new Error(
			'APPOINTMENT_MANAGE_SECRET is not configured. Generate one with: openssl rand -hex 32'
		);
	}
	return secret;
}

export interface ManageTokenPayload {
	appointmentId: string;
	updatedAtEpoch: number; // seconds since epoch — matches floor(updated_at / 1000)
	exp: number; // seconds since epoch
}

function b64urlEncode(buf: Buffer): string {
	return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s: string): Buffer {
	const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
	return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

export function sign(payload: ManageTokenPayload): string {
	const json = JSON.stringify(payload);
	const body = b64urlEncode(Buffer.from(json, 'utf8'));
	const mac = createHmac('sha256', getSecret()).update(body).digest();
	return `${body}.${b64urlEncode(mac)}`;
}

export function verify(token: string): ManageTokenPayload | null {
	if (typeof token !== 'string' || token.length === 0 || token.length > 4096) return null;
	const dot = token.indexOf('.');
	if (dot <= 0 || dot === token.length - 1) return null;

	const body = token.slice(0, dot);
	const sig = token.slice(dot + 1);

	let providedMac: Buffer;
	try {
		providedMac = b64urlDecode(sig);
	} catch {
		return null;
	}

	const expectedMac = createHmac('sha256', getSecret()).update(body).digest();
	if (providedMac.length !== expectedMac.length) return null;
	if (!timingSafeEqual(providedMac, expectedMac)) return null;

	let payload: ManageTokenPayload;
	try {
		const json = b64urlDecode(body).toString('utf8');
		payload = JSON.parse(json);
	} catch {
		return null;
	}

	if (
		!payload ||
		typeof payload.appointmentId !== 'string' ||
		typeof payload.updatedAtEpoch !== 'number' ||
		typeof payload.exp !== 'number'
	) {
		return null;
	}

	const nowSec = Math.floor(Date.now() / 1000);
	if (payload.exp < nowSec) return null;

	return payload;
}

// Epoch (seconds) representation of an appointment's updated_at. Tokens bind
// to this so any later mutation (manual edit, reschedule, cancel) invalidates
// every outstanding link.
export function appointmentUpdatedAtEpoch(updatedAt: Date): number {
	return Math.floor(updatedAt.getTime() / 1000);
}

// Token lifetime: appointment.scheduled_start + 1 hour, expressed in seconds.
export function manageTokenExpiry(scheduledStart: Date): number {
	return Math.floor(scheduledStart.getTime() / 1000) + 60 * 60;
}

export function buildManageLink(input: {
	appointmentId: string;
	updatedAt: Date;
	scheduledStart: Date;
}): string {
	const token = sign({
		appointmentId: input.appointmentId,
		updatedAtEpoch: appointmentUpdatedAtEpoch(input.updatedAt),
		exp: manageTokenExpiry(input.scheduledStart)
	});
	const base = (env.APP_URL ?? 'http://localhost:5173').replace(/\/$/, '');
	return `${base}/book/manage/${token}`;
}
