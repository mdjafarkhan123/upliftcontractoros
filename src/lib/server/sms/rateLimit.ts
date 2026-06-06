// Outbound SMS rate limiting (Blueprint §"Rate Limiting"). Three caps:
//   - per-org messages/minute   (sliding window)
//   - global  messages/minute   (sliding window, platform-wide system cap)
//   - per-org messages/day      (UTC fixed-window counter)
//
// All three are evaluated in a single atomic Lua script so a message is only
// counted when every limit passes — no partial increments under concurrency.
// Fails OPEN on Redis errors (matches media/booking limiters): a Redis hiccup
// must never stop legitimate sends.

import { redisConnection } from '$lib/server/queue/bullmq';

const env = process.env;

const MIN_WINDOW_MS = 60_000;
const DAY_TTL_SECONDS = 26 * 3600; // a little over 24h so the UTC-day key self-cleans

function intEnv(name: string, fallback: number): number {
	const raw = env[name];
	if (!raw) return fallback;
	const n = Number(raw);
	return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

// Per-org caps are stored on org_sms_credit (PO-controlled via /jafar); these env
// values are only the fallback default used when a caller doesn't pass an
// explicit per-org limit. The global/minute cap is platform-wide (not per-org).
export function smsRateDefaults() {
	return {
		orgPerMin: intEnv('SMS_RATE_ORG_PER_MIN', 30),
		orgPerDay: intEnv('SMS_RATE_ORG_PER_DAY', 1000)
	};
}

export function smsGlobalPerMin(): number {
	return intEnv('SMS_RATE_GLOBAL_PER_MIN', 300);
}

// KEYS: orgMinKey, globalMinKey, orgDayKey
// ARGV: now(ms), windowMs, orgMinLimit, globalMinLimit, dayLimit, dayTtlSec, member
// Returns { allowedFlag, limitName } where allowedFlag is 1 (allowed) or 0 (blocked).
const SMS_RATE_LUA = `
local now    = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local orgMinLimit    = tonumber(ARGV[3])
local globalMinLimit = tonumber(ARGV[4])
local dayLimit       = tonumber(ARGV[5])
local dayTtl         = tonumber(ARGV[6])
local member = ARGV[7]

-- Drop entries older than the sliding window before counting.
redis.call('ZREMRANGEBYSCORE', KEYS[1], 0, now - window)
redis.call('ZREMRANGEBYSCORE', KEYS[2], 0, now - window)
local orgMinCount    = redis.call('ZCARD', KEYS[1])
local globalMinCount = redis.call('ZCARD', KEYS[2])
local dayCount       = tonumber(redis.call('GET', KEYS[3]) or '0')

if orgMinCount >= orgMinLimit then return {0, 'org_min'} end
if globalMinCount >= globalMinLimit then return {0, 'global_min'} end
if dayCount >= dayLimit then return {0, 'org_day'} end

-- All limits passed — commit one slot to each counter.
redis.call('ZADD', KEYS[1], now, member)
redis.call('PEXPIRE', KEYS[1], window + 5000)
redis.call('ZADD', KEYS[2], now, member)
redis.call('PEXPIRE', KEYS[2], window + 5000)
local d = redis.call('INCR', KEYS[3])
if d == 1 then redis.call('EXPIRE', KEYS[3], dayTtl) end

return {1, ''}
`;

export type SmsRateLimit = 'org_min' | 'global_min' | 'org_day';

export type SmsRateResult =
	| { allowed: true }
	| { allowed: false; limit: SmsRateLimit; retryAfterMs: number };

function utcDateStamp(now: number): string {
	return new Date(now).toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}

function msUntilNextUtcDay(now: number): number {
	const d = new Date(now);
	const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
	return Math.max(next - now, 1000);
}

/**
 * Atomically reserve one send slot for `orgId` against all three SMS caps.
 * `orgPerMin`/`orgPerDay` are the org's own limits (from org_sms_credit); when
 * omitted they fall back to the env defaults. The global/minute cap is always
 * platform-wide. Returns `{ allowed: true }` if a slot was committed, otherwise
 * the limit that tripped plus a suggested re-queue delay. Fails OPEN on Redis
 * errors.
 */
export async function reserveSmsRateSlot(
	orgId: string,
	orgLimits?: { perMin: number; perDay: number }
): Promise<SmsRateResult> {
	const defaults = smsRateDefaults();
	// Per the org-limits convention, 0 means "unlimited" — substitute a sentinel
	// so the per-org cap never trips (only the global cap can). A missing value
	// falls back to the env default.
	const UNLIMITED = 1_000_000_000;
	const rawMin = orgLimits?.perMin ?? defaults.orgPerMin;
	const rawDay = orgLimits?.perDay ?? defaults.orgPerDay;
	const limits = {
		orgPerMin: rawMin > 0 ? rawMin : UNLIMITED,
		orgPerDay: rawDay > 0 ? rawDay : UNLIMITED,
		globalPerMin: smsGlobalPerMin()
	};
	const now = Date.now();
	try {
		const redis = redisConnection();
		const member = `${now}-${Math.random().toString(36).slice(2)}`;
		const result = (await redis.eval(
			SMS_RATE_LUA,
			3,
			`sms:rate:org_min:${orgId}`,
			`sms:rate:global_min`,
			`sms:rate:org_day:${orgId}:${utcDateStamp(now)}`,
			String(now),
			String(MIN_WINDOW_MS),
			String(limits.orgPerMin),
			String(limits.globalPerMin),
			String(limits.orgPerDay),
			String(DAY_TTL_SECONDS),
			member
		)) as [number, string];

		const [flag, limitName] = result;
		if (flag === 1) return { allowed: true };

		const limit = (limitName || 'org_min') as SmsRateLimit;
		// Minute caps clear within a window; the daily cap clears at next UTC day.
		const retryAfterMs =
			limit === 'org_day'
				? msUntilNextUtcDay(now)
				: MIN_WINDOW_MS + Math.floor(Math.random() * 10_000); // jitter to spread the backlog
		return { allowed: false, limit, retryAfterMs };
	} catch (err) {
		console.warn('[sms rateLimit] Redis check failed (failing open):', err);
		return { allowed: true };
	}
}
