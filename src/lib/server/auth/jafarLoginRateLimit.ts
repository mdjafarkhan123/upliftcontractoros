const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

type RateLimitRecord = {
	count: number;
	resetsAt: number;
};

const attempts = new Map<string, RateLimitRecord>();

export function checkJafarLoginRateLimit(ip: string): {
	allowed: boolean;
	retryAfterSeconds?: number;
} {
	const now = Date.now();
	const existing = attempts.get(ip);

	if (!existing || existing.resetsAt <= now) {
		attempts.set(ip, { count: 0, resetsAt: now + WINDOW_MS });
		return { allowed: true };
	}

	if (existing.count >= MAX_ATTEMPTS) {
		return {
			allowed: false,
			retryAfterSeconds: Math.ceil((existing.resetsAt - now) / 1000)
		};
	}

	return { allowed: true };
}

export function recordFailedJafarLogin(ip: string): void {
	const now = Date.now();
	const existing = attempts.get(ip);

	if (!existing || existing.resetsAt <= now) {
		attempts.set(ip, { count: 1, resetsAt: now + WINDOW_MS });
		return;
	}

	existing.count += 1;
}

export function clearJafarLoginRateLimit(ip: string): void {
	attempts.delete(ip);
}
