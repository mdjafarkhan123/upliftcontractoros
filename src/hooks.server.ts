import { redirect } from '@sveltejs/kit';
import type { Handle, HandleServerError, RequestEvent } from '@sveltejs/kit';
import type { JwtPayload, User } from '@supabase/supabase-js';
import { createServerClient } from '$lib/server/auth/supabase';
import { getJafarSession } from '$lib/server/auth/jafarSession';
import { loadAuthContext, type AuthContext } from '$lib/server/auth/loadAuthContext';
import {
	checkFeatureForPath,
	featureDisabledResponse
} from '$lib/server/auth/enforceFeatureForRequest';
import { applyCorsHeaders, buildCorsHeaders, resolveAllowedOrigin } from '$lib/server/webchat/cors';

const PUBLIC_PREFIXES = [
	'/auth',
	'/jafar',
	'/q/',
	'/r/',
	'/book',
	'/api/admin',
	'/api/webhooks',
	'/api/jafar',
	'/api/webchat',
	'/api/public/booking',
	'/api/r/'
];
const PUBLIC_EXACT = new Set<string>(['/jafar']);

// Routes that remain accessible to authenticated users while their org is suspended.
// Includes the suspended page itself, session reads (so the layout can hydrate),
// and future-safe billing recovery routes. Logout already lives under /auth/* (public).
const SUSPENDED_ALLOWED_APP_PATHS = ['/suspended', '/billing'];
const SUSPENDED_ALLOWED_API_PATHS = ['/api/session', '/api/billing'];

// While an org is `pending_setup`, the only API surface it may touch is the
// onboarding wizard's own endpoints plus session reads. Everything else is
// blocked so no business writes happen before onboarding completes.
const PENDING_SETUP_ALLOWED_API_PATHS = ['/api/onboarding', '/api/session'];

function isOnboardingPath(pathname: string): boolean {
	return pathname === '/onboarding' || pathname.startsWith('/onboarding/');
}

function isPublicPath(pathname: string): boolean {
	if (PUBLIC_EXACT.has(pathname)) return true;
	for (const p of PUBLIC_PREFIXES) if (pathname.startsWith(p)) return true;
	return false;
}

// Minimal User built from verified JWT claims — downstream consumers only read
// `id` and `app_metadata` (password_changed gates) plus email for display.
function userFromClaims(claims: JwtPayload): User {
	return {
		id: claims.sub,
		aud: typeof claims.aud === 'string' ? claims.aud : (claims.aud?.[0] ?? 'authenticated'),
		email: claims.email,
		phone: claims.phone,
		app_metadata: claims.app_metadata ?? {},
		user_metadata: claims.user_metadata ?? {},
		created_at: ''
	} as User;
}

function matchesPrefix(pathname: string, prefixes: string[]): boolean {
	for (const p of prefixes) {
		if (pathname === p || pathname.startsWith(p + '/')) return true;
	}
	return false;
}

function logSuspendedBlock(event: RequestEvent, auth: AuthContext, reason: 'org_suspended'): void {
	console.warn(
		JSON.stringify({
			request_id: crypto.randomUUID(),
			org_id: auth.orgId,
			member_id: auth.member.id,
			route: event.url.pathname,
			reason
		})
	);
}

// Performance guardrail: any API request slower than this logs a structured `slow_api` warning.
// Correctness has TypeScript + tests; latency had no signal, which is how sequential-await query
// waterfalls silently accreted (see the job-detail endpoint). This is that missing signal — every
// API response also carries a `Server-Timing: app;dur=<ms>` header so its cost shows up directly in
// the browser Network tab (DevTools → Timing), making a slow endpoint obvious on day one.
const SLOW_API_MS = 800;

export const handle: Handle = async ({ event, resolve }) => {
	const { pathname } = event.url;

	// 0. CORS for /api/webchat/* — widget is embedded on third-party origins.
	// Source of truth is each widget's domain_allowlist (via validateOrigin).
	// Per-route handlers still enforce validateOrigin against the specific widget;
	// this only governs browser-level CORS headers (preflight + reflected Origin).
	if (pathname.startsWith('/api/webchat')) {
		const origin = event.request.headers.get('origin');
		const allowedOrigin = await resolveAllowedOrigin(origin);

		if (event.request.method === 'OPTIONS') {
			return new Response(null, { status: 204, headers: buildCorsHeaders(allowedOrigin) });
		}

		const response = await resolve(event);
		return applyCorsHeaders(response, allowedOrigin);
	}

	// 1. Always attach supabase client for downstream use (auth routes need it).
	// No auth calls here — public paths don't need them, non-public paths do their
	// own single getUser() below (validates the JWT) and feed it to loadAuthContext.
	const supabase = createServerClient(event);
	event.locals.supabase = supabase;

	// 2. /jafar route protection (separate session system)
	if (pathname.startsWith('/jafar') && pathname !== '/jafar') {
		if (!getJafarSession(event)) throw redirect(302, '/jafar');
	}
	if (pathname.startsWith('/api/admin')) {
		if (!getJafarSession(event)) {
			return new Response(JSON.stringify({ error: 'Unauthorized.' }), {
				status: 401,
				headers: { 'content-type': 'application/json' }
			});
		}
	}

	// 3. Contractor auth context — skip for public routes and webhooks
	event.locals.auth = null;
	if (!isPublicPath(pathname)) {
		// getClaims() verifies the JWT locally against the project's ES256 JWKS
		// (cached in-process) — no auth-server round trip. For legacy HS256 tokens
		// it falls back to a network getUser() internally, so this is never weaker
		// than the old getUser() call.
		const { data: claimsData } = await supabase.auth.getClaims();
		let user: User | null = claimsData ? userFromClaims(claimsData.claims) : null;
		// JWT app_metadata lags admin-side updates until the token refreshes.
		// password_changed=false drives redirects below, so confirm a falsy value
		// against the auth server — only pre-onboarding users pay this round trip,
		// and it prevents a redirect loop right after the password is changed.
		if (user && !user.app_metadata.password_changed) {
			const {
				data: { user: freshUser }
			} = await supabase.auth.getUser();
			user = freshUser;
		}
		const auth = user ? await loadAuthContext(user) : null;
		event.locals.auth = auth;

		// /change-password is special: needs auth loaded, but doesn't enforce password_changed
		if (pathname === '/change-password') {
			if (!auth) throw redirect(302, '/auth/login');
			if (auth.orgStatus === 'suspended') {
				logSuspendedBlock(event, auth, 'org_suspended');
				throw redirect(302, '/suspended');
			}
			// New orgs change their password inside the onboarding wizard, not here.
			if (auth.orgStatus === 'pending_setup') throw redirect(302, '/onboarding');
			if (auth.supabaseUser.app_metadata.password_changed) throw redirect(302, '/dashboard');
		} else {
			// App routes (everything not /api/*, not public)
			const isAppRoute = !pathname.startsWith('/api/');
			if (isAppRoute) {
				if (!auth) throw redirect(302, '/auth/login');
				if (
					auth.orgStatus === 'suspended' &&
					!matchesPrefix(pathname, SUSPENDED_ALLOWED_APP_PATHS)
				) {
					logSuspendedBlock(event, auth, 'org_suspended');
					throw redirect(302, '/suspended');
				}
				// Onboarding gate: pending_setup orgs are held in the wizard (no bypass);
				// completed orgs are bounced off the wizard. The wizard owns Step 1
				// (forced password), so password_changed is only enforced outside it.
				if (auth.orgStatus === 'pending_setup') {
					if (!isOnboardingPath(pathname)) throw redirect(302, '/onboarding');
				} else {
					if (isOnboardingPath(pathname)) throw redirect(302, '/dashboard');
					if (!auth.supabaseUser.app_metadata.password_changed) {
						throw redirect(302, '/change-password');
					}
				}
				// NOTE: is_setup_complete is no longer a blocker — surfaced as banner in UI.
			} else {
				// /api/* (non-public) — require auth but return 401 instead of redirect
				if (!auth) {
					return new Response(JSON.stringify({ error: 'Unauthorized.' }), {
						status: 401,
						headers: { 'content-type': 'application/json' }
					});
				}
				if (
					auth.orgStatus === 'suspended' &&
					!matchesPrefix(pathname, SUSPENDED_ALLOWED_API_PATHS)
				) {
					logSuspendedBlock(event, auth, 'org_suspended');
					return new Response(
						JSON.stringify({
							error: 'Organization access is suspended.',
							code: 'ORG_SUSPENDED'
						}),
						{ status: 403, headers: { 'content-type': 'application/json' } }
					);
				}
				if (
					auth.orgStatus === 'pending_setup' &&
					!matchesPrefix(pathname, PENDING_SETUP_ALLOWED_API_PATHS)
				) {
					return new Response(
						JSON.stringify({
							error: 'Complete onboarding to access this feature.',
							code: 'ORG_PENDING_SETUP'
						}),
						{ status: 403, headers: { 'content-type': 'application/json' } }
					);
				}
				const featureCheck = checkFeatureForPath(pathname, auth);
				if (!featureCheck.ok) {
					console.warn(
						JSON.stringify({
							request_id: crypto.randomUUID(),
							org_id: auth.orgId,
							member_id: auth.member.id,
							route: pathname,
							reason: 'feature_disabled',
							feature: featureCheck.feature
						})
					);
					return featureDisabledResponse(featureCheck.feature);
				}
			}
		}
	}

	// Time API requests and surface the cost (header + slow-request log). Page/asset requests
	// are left untouched — this is scoped to the JSON API where the query waterfalls live.
	if (pathname.startsWith('/api/')) {
		const started = performance.now();
		const response = await resolve(event);
		const durationMs = Math.round(performance.now() - started);
		try {
			response.headers.set('Server-Timing', `app;dur=${durationMs}`);
		} catch {
			// Some responses (e.g. 304 / immutable) reject header mutation — timing is best-effort.
		}
		if (durationMs > SLOW_API_MS) {
			console.warn(
				JSON.stringify({
					request_id: crypto.randomUUID(),
					route: pathname,
					method: event.request.method,
					duration_ms: durationMs,
					reason: 'slow_api'
				})
			);
		}
		return response;
	}

	return resolve(event);
};

/**
 * Log the FULL cause chain of any unhandled server error.
 *
 * Without this, SvelteKit's default logger prints only the top-level error. Drizzle wraps every
 * failure — including a connection dying mid-flight — as `Failed query: <sql>`, and hides the
 * real driver/pooler error (`CONNECTION_CLOSED`, `MaxClientsInSessionMode`, a Postgres code, …)
 * in `error.cause`. That made a connection-layer fault read as if the SQL itself were broken.
 *
 * Returns a generic shape to the client: causes are for the server log only, never the browser.
 */
export const handleError: HandleServerError = ({ error, event, status, message }) => {
	// 404s and other expected client-side statuses aren't faults — don't log them as such.
	if (status !== 500) return { message };

	const chain: { name?: string; message?: string; code?: string; severity?: string }[] = [];
	let cur: unknown = error;
	// Guard against a self-referential cause chain.
	for (let depth = 0; cur instanceof Error && depth < 5; depth++) {
		const e = cur as Error & { code?: string; severity?: string };
		chain.push({ name: e.name, message: e.message, code: e.code, severity: e.severity });
		if (e.cause === cur) break;
		cur = e.cause;
	}

	console.error(
		JSON.stringify({
			reason: 'server_error',
			route: event.url.pathname,
			method: event.request.method,
			cause_chain: chain
		})
	);
	if (error instanceof Error && error.stack) console.error(error.stack);

	return { message: 'Internal Error' };
};
