import { randomBytes } from 'crypto';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { reviewRequests } from '$lib/server/db/schema';

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const TOKEN_LENGTH = 12;
const MAX_ATTEMPTS = 5;

export const REVIEW_TOKEN_TTL_DAYS = 14;

function makeToken(): string {
	const bytes = randomBytes(TOKEN_LENGTH);
	let out = '';
	for (let i = 0; i < TOKEN_LENGTH; i++) out += ALPHABET[bytes[i] % 62];
	return out;
}

/**
 * Generate a base62 token guaranteed unique in `review_requests.token`.
 * Short enough (12 chars / ~71 bits) to avoid carrier spam heuristics on
 * outbound SMS, long enough that enumeration is computationally hopeless.
 */
export async function generateReviewToken(): Promise<string> {
	for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
		const candidate = makeToken();
		const [hit] = await db
			.select({ id: reviewRequests.id })
			.from(reviewRequests)
			.where(eq(reviewRequests.token, candidate))
			.limit(1);
		if (!hit) return candidate;
	}
	throw new Error('Failed to generate a unique review token after retries.');
}

export function reviewTokenExpiry(now: Date = new Date()): Date {
	return new Date(now.getTime() + REVIEW_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
}
