// Public booking rate limits. Backed by Redis (reuses the BullMQ connection).
// Fail-open: if Redis is unreachable, requests proceed. Honeypot + downstream
// validation remain in place.

import { createHash } from 'node:crypto';
import { redisConnection } from '$lib/server/queue/bullmq';

const IP_LIMIT_KEY = (ip: string) => `booking:ratelimit:ip:${ip}`;
const PHONE_LIMIT_KEY = (e164: string) => `booking:ratelimit:phone:${e164}`;
const MANAGE_TOKEN_LIMIT_KEY = (tokenHash: string) => `appt:manage:ratelimit:token:${tokenHash}`;
const REQUEST_PHOTO_IP_LIMIT_KEY = (ip: string) => `request:photo:ratelimit:ip:${ip}`;

const IP_WINDOW_SECONDS = 600; // 10 minutes
const IP_MAX_REQUESTS = 3;
const PHONE_COOLDOWN_SECONDS = 3600; // 60 minutes
const MANAGE_TOKEN_WINDOW_SECONDS = 60;
const MANAGE_TOKEN_MAX_REQUESTS = 10;
// Public request-photo uploads get their OWN, far more generous IP budget than the
// submission limiter: a single submission can attach up to 10 photos (one POST each),
// so the 3-per-10-min submission cap would wrongly block most of them. This window is
// sized for one full 10-photo set plus retry headroom, on a separate key.
const REQUEST_PHOTO_IP_WINDOW_SECONDS = 600; // 10 minutes
const REQUEST_PHOTO_IP_MAX_REQUESTS = 40;

export function extractClientIp(request: Request): string {
	const forwarded = request.headers.get('x-forwarded-for');
	if (forwarded) {
		const first = forwarded.split(',')[0]?.trim();
		if (first) return first;
	}
	return 'unknown';
}

export interface IpLimitResult {
	allowed: boolean;
	retryAfterSeconds?: number;
}

// Increments the IP counter and returns whether the request is allowed.
// Uses INCR + EXPIRE on first hit. Fails open on Redis errors.
export async function checkIpRateLimit(ip: string): Promise<IpLimitResult> {
	if (!ip || ip === 'unknown') return { allowed: true };
	try {
		const redis = redisConnection();
		const key = IP_LIMIT_KEY(ip);
		const count = await redis.incr(key);
		if (count === 1) {
			await redis.expire(key, IP_WINDOW_SECONDS);
		}
		if (count > IP_MAX_REQUESTS) {
			const ttl = await redis.ttl(key);
			return { allowed: false, retryAfterSeconds: ttl > 0 ? ttl : IP_WINDOW_SECONDS };
		}
		return { allowed: true };
	} catch (err) {
		console.warn('[booking rateLimit] Redis IP check failed (failing open):', err);
		return { allowed: true };
	}
}

// Per-IP throttle for public request-photo uploads. Separate key + budget from the
// submission limiter so a legitimate 10-photo attachment isn't cut off. Fails open.
export async function checkRequestPhotoIpRateLimit(ip: string): Promise<IpLimitResult> {
	if (!ip || ip === 'unknown') return { allowed: true };
	try {
		const redis = redisConnection();
		const key = REQUEST_PHOTO_IP_LIMIT_KEY(ip);
		const count = await redis.incr(key);
		if (count === 1) {
			await redis.expire(key, REQUEST_PHOTO_IP_WINDOW_SECONDS);
		}
		if (count > REQUEST_PHOTO_IP_MAX_REQUESTS) {
			const ttl = await redis.ttl(key);
			return { allowed: false, retryAfterSeconds: ttl > 0 ? ttl : REQUEST_PHOTO_IP_WINDOW_SECONDS };
		}
		return { allowed: true };
	} catch (err) {
		console.warn('[booking rateLimit] Redis request-photo IP check failed (failing open):', err);
		return { allowed: true };
	}
}

// Returns true when a cooldown for this phone is already active. Fails open.
export async function isPhoneOnCooldown(e164: string): Promise<boolean> {
	try {
		const redis = redisConnection();
		const exists = await redis.exists(PHONE_LIMIT_KEY(e164));
		return exists === 1;
	} catch (err) {
		console.warn('[booking rateLimit] Redis phone check failed (failing open):', err);
		return false;
	}
}

// Set the post-submission cooldown for a phone. Fails open.
export async function setPhoneCooldown(e164: string): Promise<void> {
	try {
		const redis = redisConnection();
		await redis.set(PHONE_LIMIT_KEY(e164), '1', 'EX', PHONE_COOLDOWN_SECONDS);
	} catch (err) {
		console.warn('[booking rateLimit] Redis phone cooldown set failed:', err);
	}
}

// 10 req/min per manage token. We key by sha256(token) so we never persist the
// raw signed token in Redis. Fails open on Redis errors.
export async function checkManageTokenRateLimit(token: string): Promise<IpLimitResult> {
	if (!token) return { allowed: true };
	try {
		const tokenHash = createHash('sha256').update(token).digest('hex');
		const redis = redisConnection();
		const key = MANAGE_TOKEN_LIMIT_KEY(tokenHash);
		const count = await redis.incr(key);
		if (count === 1) {
			await redis.expire(key, MANAGE_TOKEN_WINDOW_SECONDS);
		}
		if (count > MANAGE_TOKEN_MAX_REQUESTS) {
			const ttl = await redis.ttl(key);
			return { allowed: false, retryAfterSeconds: ttl > 0 ? ttl : MANAGE_TOKEN_WINDOW_SECONDS };
		}
		return { allowed: true };
	} catch (err) {
		console.warn('[booking rateLimit] Redis manage-token check failed (failing open):', err);
		return { allowed: true };
	}
}
