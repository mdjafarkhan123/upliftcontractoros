/**
 * In-memory rate limiter with TTL expiry.
 * Phase-1 requirement — no Redis dependency.
 * Works per-process only; sufficient for single-instance deployment.
 *
 * Buckets:
 *   session_start   — 10 req / hour / IP hash
 *   session_message — 60 req / hour / session_token
 *   session_restore — 30 req / hour / session_token
 *   session_poll    — 1500 req / hour / session_token  (≈ one every 2.4s)
 */

interface Bucket {
	count: number;
	resetAt: number; // Unix ms
}

const store = new Map<string, Bucket>();

// Purge expired entries every 5 minutes to prevent unbounded growth
setInterval(() => {
	const now = Date.now();
	for (const [k, v] of store) {
		if (v.resetAt < now) store.delete(k);
	}
}, 5 * 60 * 1000);

function check(key: string, limit: number, windowMs: number): boolean {
	const now = Date.now();
	const existing = store.get(key);
	if (!existing || existing.resetAt < now) {
		store.set(key, { count: 1, resetAt: now + windowMs });
		return true;
	}
	if (existing.count >= limit) return false;
	existing.count += 1;
	return true;
}

function retryAfter(key: string): number {
	const bucket = store.get(key);
	if (!bucket) return 0;
	return Math.ceil(Math.max(0, bucket.resetAt - Date.now()) / 1000);
}

const HOUR_MS = 60 * 60 * 1000;

export function checkStartRateLimit(ipHash: string): { ok: boolean; retryAfter: number } {
	const key = `start:${ipHash}`;
	const ok = check(key, 10, HOUR_MS);
	return { ok, retryAfter: ok ? 0 : retryAfter(key) };
}

export function checkMessageRateLimit(sessionToken: string): { ok: boolean; retryAfter: number } {
	const key = `msg:${sessionToken}`;
	const ok = check(key, 60, HOUR_MS);
	return { ok, retryAfter: ok ? 0 : retryAfter(key) };
}

export function checkRestoreRateLimit(sessionToken: string): { ok: boolean; retryAfter: number } {
	const key = `restore:${sessionToken}`;
	const ok = check(key, 30, HOUR_MS);
	return { ok, retryAfter: ok ? 0 : retryAfter(key) };
}

export function checkPollRateLimit(sessionToken: string): { ok: boolean; retryAfter: number } {
	const key = `poll:${sessionToken}`;
	const ok = check(key, 1500, HOUR_MS);
	return { ok, retryAfter: ok ? 0 : retryAfter(key) };
}
