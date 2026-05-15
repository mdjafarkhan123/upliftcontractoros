import { redisConnection } from '$lib/server/queue/bullmq';

const UPLOAD_WINDOW_MS = 60_000;
const UPLOAD_LIMIT = 20;

/**
 * Atomic sliding-window rate limiter using a Lua script.
 * Executes as a single atomic operation on Redis — no concurrent bypass is possible.
 *
 * Returns true if the request is allowed, false if the limit is exceeded.
 */
const RATE_LIMIT_LUA = `
local key     = KEYS[1]
local now     = tonumber(ARGV[1])
local window  = tonumber(ARGV[2])
local limit   = tonumber(ARGV[3])
local member  = ARGV[4]

-- Remove entries older than the sliding window
redis.call('ZREMRANGEBYSCORE', key, 0, now - window)

-- Count entries within the window
local count = redis.call('ZCARD', key)

if count >= limit then
  return 0
end

-- Add current request with a unique member string
redis.call('ZADD', key, now, member)
-- Expire slightly beyond window so old entries aren't orphaned forever
redis.call('PEXPIRE', key, window + 5000)

return 1
`;

export async function checkUploadRateLimit(orgId: string): Promise<boolean> {
	const redis = redisConnection();
	const key = `rate:media_upload:${orgId}`;
	const now = Date.now();
	// Unique member prevents collisions if two requests arrive at the same millisecond
	const member = `${now}-${Math.random().toString(36).slice(2)}`;

	const result = await redis.eval(
		RATE_LIMIT_LUA,
		1,
		key,
		String(now),
		String(UPLOAD_WINDOW_MS),
		String(UPLOAD_LIMIT),
		member
	);

	return result === 1;
}
