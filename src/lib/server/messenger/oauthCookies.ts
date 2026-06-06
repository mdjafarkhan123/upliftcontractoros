import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Cookies } from '@sveltejs/kit';
import { metaAppSecret } from './client';
import type { ManagedPage } from './graph';

// Two short-lived, HMAC-signed, httpOnly cookies carry state across the OAuth
// redirect (which leaves and re-enters our origin):
//   mfb_oauth_state   — CSRF nonce + the org/member that began the flow (10 min)
//   mfb_oauth_pending — candidate Pages when the account manages 2+ (5 min)
// Both are path-scoped to /api/settings/messenger so they are only ever sent to
// the callback/picker endpoints, never to unrelated routes. They are SIGNED (not
// encrypted): httpOnly keeps JS out and the signature blocks forgery/tampering.

const COOKIE_PATH = '/api/settings/messenger';
const STATE_COOKIE = 'mfb_oauth_state';
const PENDING_COOKIE = 'mfb_oauth_pending';

const STATE_TTL_MS = 10 * 60_000;
const PENDING_TTL_MS = 5 * 60_000;

function sign(payload: unknown): string {
	const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
	const mac = createHmac('sha256', metaAppSecret()).update(body).digest('hex');
	return `${body}.${mac}`;
}

function unsign<T>(value: string | undefined): T | null {
	if (!value) return null;
	const dot = value.lastIndexOf('.');
	if (dot <= 0) return null;
	const body = value.slice(0, dot);
	const mac = Buffer.from(value.slice(dot + 1), 'hex');
	const expected = createHmac('sha256', metaAppSecret()).update(body).digest('hex');
	const expectedBuf = Buffer.from(expected, 'hex');
	if (mac.length !== expectedBuf.length || !timingSafeEqual(mac, expectedBuf)) return null;
	try {
		return JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as T;
	} catch {
		return null;
	}
}

// --- CSRF state cookie ----------------------------------------------------

type StatePayload = { s: string; o: string; m: string; e: number };

export function setStateCookie(
	cookies: Cookies,
	nonce: string,
	orgId: string,
	memberId: string
): void {
	const payload: StatePayload = { s: nonce, o: orgId, m: memberId, e: Date.now() + STATE_TTL_MS };
	// `secure` is intentionally omitted — SvelteKit defaults it to true except on
	// http://localhost, so dev tunnels and prod both behave correctly.
	cookies.set(STATE_COOKIE, sign(payload), {
		path: COOKIE_PATH,
		httpOnly: true,
		sameSite: 'lax',
		maxAge: STATE_TTL_MS / 1000
	});
}

export function readStateCookie(cookies: Cookies): StatePayload | null {
	const payload = unsign<StatePayload>(cookies.get(STATE_COOKIE));
	if (!payload || payload.e < Date.now()) return null;
	return payload;
}

export function clearStateCookie(cookies: Cookies): void {
	cookies.delete(STATE_COOKIE, { path: COOKIE_PATH });
}

// --- Multi-page pending cookie --------------------------------------------

type PendingPayload = { o: string; m: string; e: number; pages: ManagedPage[] };

export function setPendingCookie(
	cookies: Cookies,
	orgId: string,
	memberId: string,
	pages: ManagedPage[]
): void {
	const payload: PendingPayload = { o: orgId, m: memberId, e: Date.now() + PENDING_TTL_MS, pages };
	cookies.set(PENDING_COOKIE, sign(payload), {
		path: COOKIE_PATH,
		httpOnly: true,
		sameSite: 'lax',
		maxAge: PENDING_TTL_MS / 1000
	});
}

export function readPendingCookie(cookies: Cookies): PendingPayload | null {
	const payload = unsign<PendingPayload>(cookies.get(PENDING_COOKIE));
	if (!payload || payload.e < Date.now()) return null;
	return payload;
}

export function clearPendingCookie(cookies: Cookies): void {
	cookies.delete(PENDING_COOKIE, { path: COOKIE_PATH });
}
