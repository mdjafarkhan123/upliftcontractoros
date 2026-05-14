import { redisConnection } from '$lib/server/queue/bullmq';

export type RateLimitResult = { ok: boolean; remaining: number; resetSec: number };

/**
 * Sliding-window-ish fixed-window rate limit using INCR + EXPIRE.
 * Key shape: rl:{scope}:{identifier}:{windowEpoch}
 */
export async function rateLimit(
	scope: string,
	identifier: string,
	limit: number,
	windowSec: number
): Promise<RateLimitResult> {
	const redis = redisConnection();
	const windowEpoch = Math.floor(Date.now() / 1000 / windowSec);
	const key = `rl:${scope}:${identifier}:${windowEpoch}`;
	const pipe = redis.multi();
	pipe.incr(key);
	pipe.expire(key, windowSec);
	const res = await pipe.exec();
	const count = Number((res?.[0]?.[1] as number | string) ?? 0);
	const remaining = Math.max(0, limit - count);
	const resetSec = (windowEpoch + 1) * windowSec - Math.floor(Date.now() / 1000);
	return { ok: count <= limit, remaining, resetSec };
}
