/**
 * CORS handling for /api/webchat/* routes.
 *
 * Source of truth for permitted origins is each widget's `domain_allowlist`,
 * reused via `validateOrigin`. We never reflect with '*' — only the exact
 * requesting Origin, and only when it matches at least one active widget's
 * allowlist (an empty allowlist permits all, matching existing semantics).
 *
 * Per-route handlers still enforce `validateOrigin` against the specific
 * widget for the request; this layer only governs the browser-level CORS
 * headers required so those handlers can be reached.
 */
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { webchatWidgets } from '$lib/server/db/schema';
import { validateOrigin } from './validateOrigin';

const ALLOW_METHODS = 'GET, POST, OPTIONS';
const ALLOW_HEADERS = 'Authorization, Content-Type';
const MAX_AGE = '86400';

/**
 * Check if `origin` is permitted by any active widget's domain_allowlist.
 * Returns the origin verbatim when allowed, otherwise null.
 */
export async function resolveAllowedOrigin(origin: string | null): Promise<string | null> {
	if (!origin) return null;

	const widgets = await db
		.select({ domain_allowlist: webchatWidgets.domain_allowlist })
		.from(webchatWidgets)
		.where(eq(webchatWidgets.is_active, true));

	const probe = new Request('http://_/', { headers: { origin } });
	for (const w of widgets) {
		if (validateOrigin(probe, w.domain_allowlist)) return origin;
	}
	return null;
}

/** Build the headers used on both preflight and actual responses. */
export function buildCorsHeaders(allowedOrigin: string | null): Record<string, string> {
	const headers: Record<string, string> = {
		'Access-Control-Allow-Methods': ALLOW_METHODS,
		'Access-Control-Allow-Headers': ALLOW_HEADERS,
		'Access-Control-Max-Age': MAX_AGE,
		Vary: 'Origin'
	};
	if (allowedOrigin) headers['Access-Control-Allow-Origin'] = allowedOrigin;
	return headers;
}

/** Merge CORS headers into an existing Response, preserving any existing Vary. */
export function applyCorsHeaders(response: Response, allowedOrigin: string | null): Response {
	if (allowedOrigin) {
		response.headers.set('Access-Control-Allow-Origin', allowedOrigin);
		response.headers.set('Access-Control-Allow-Methods', ALLOW_METHODS);
		response.headers.set('Access-Control-Allow-Headers', ALLOW_HEADERS);
	}
	const existingVary = response.headers.get('Vary');
	if (!existingVary) {
		response.headers.set('Vary', 'Origin');
	} else if (!/\bOrigin\b/i.test(existingVary)) {
		response.headers.set('Vary', `${existingVary}, Origin`);
	}
	return response;
}
