const env = process.env;

/**
 * Build the public review landing URL. APP_URL must be set in any environment
 * that sends review-request SMS; we never silently fall back to localhost for
 * outbound delivery — that would ship a broken link to a real customer.
 */
export function buildReviewLink(token: string): string {
	const base = env.APP_URL?.trim();
	if (!base) {
		throw new Error(
			'APP_URL is not configured — cannot send review-request SMS without a public link.'
		);
	}
	return `${base.replace(/\/$/, '')}/r/${token}`;
}
