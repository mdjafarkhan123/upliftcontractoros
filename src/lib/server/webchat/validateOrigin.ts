/**
 * Validate that the request Origin or Referer is in the widget's domain_allowlist.
 * Returns true if the origin is allowed, false if not.
 * An empty allowlist permits all origins (useful during development/testing).
 */
export function validateOrigin(
	request: Request,
	domainAllowlist: string[]
): boolean {
	if (domainAllowlist.length === 0) return true;

	const origin = request.headers.get('origin');
	const referer = request.headers.get('referer');

	// Derive origin from referer if origin header is absent
	let candidate: string | null = origin;
	if (!candidate && referer) {
		try {
			candidate = new URL(referer).origin;
		} catch {
			// Malformed referer — block
		}
	}

	if (!candidate) return false;

	// Normalize: strip trailing slash
	const normalized = candidate.replace(/\/$/, '').toLowerCase();
	return domainAllowlist.some((allowed) => allowed.replace(/\/$/, '').toLowerCase() === normalized);
}
