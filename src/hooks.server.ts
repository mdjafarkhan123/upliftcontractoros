import { redirect } from '@sveltejs/kit';
import type { Handle } from '@sveltejs/kit';
import { createServerClient } from '$lib/server/auth/supabase';
import { getJafarSession } from '$lib/server/auth/jafarSession';
import { loadAuthContext } from '$lib/server/auth/loadAuthContext';

const PUBLIC_PREFIXES = ['/auth', '/jafar', '/q/', '/api/admin', '/api/webhooks', '/api/jafar'];
const PUBLIC_EXACT = new Set<string>(['/jafar']);

function isPublicPath(pathname: string): boolean {
	if (PUBLIC_EXACT.has(pathname)) return true;
	for (const p of PUBLIC_PREFIXES) if (pathname.startsWith(p)) return true;
	return false;
}

export const handle: Handle = async ({ event, resolve }) => {
	const { pathname } = event.url;

	// 1. Always attach supabase client + safeSession for downstream use
	const supabase = createServerClient(event);
	event.locals.supabase = supabase;

	const { data: { session } } = await supabase.auth.getSession();
	if (session) {
		const { data: { user } } = await supabase.auth.getUser();
		event.locals.safeSession = user ? session : null;
	} else {
		event.locals.safeSession = null;
	}

	// 2. /jafar route protection (separate session system)
	if (pathname.startsWith('/jafar') && pathname !== '/jafar') {
		if (!getJafarSession(event)) throw redirect(302, '/jafar');
	}
	if (pathname.startsWith('/api/admin')) {
		if (!getJafarSession(event)) {
			return new Response(JSON.stringify({ message: 'Unauthorized.' }), {
				status: 401,
				headers: { 'content-type': 'application/json' }
			});
		}
	}

	// 3. Contractor auth context — skip for public routes and webhooks
	event.locals.auth = null;
	if (!isPublicPath(pathname)) {
		const auth = await loadAuthContext(event);
		event.locals.auth = auth;

		// /change-password is special: needs auth loaded, but doesn't enforce password_changed
		if (pathname === '/change-password') {
			if (!auth) throw redirect(302, '/auth/login');
			if (auth.orgStatus === 'suspended') throw redirect(302, '/auth/suspended');
			if (auth.supabaseUser.app_metadata.password_changed) throw redirect(302, '/dashboard');
		} else {
			// App routes (everything not /api/*, not public)
			const isAppRoute = !pathname.startsWith('/api/');
			if (isAppRoute) {
				if (!auth) throw redirect(302, '/auth/login');
				if (auth.orgStatus === 'suspended') throw redirect(302, '/auth/suspended');
				if (!auth.supabaseUser.app_metadata.password_changed) {
					throw redirect(302, '/change-password');
				}
				// NOTE: is_setup_complete is no longer a blocker — surfaced as banner in UI.
			} else {
				// /api/* (non-public) — require auth but return 401 instead of redirect
				if (!auth) {
					return new Response(JSON.stringify({ message: 'Unauthorized.' }), {
						status: 401,
						headers: { 'content-type': 'application/json' }
					});
				}
				if (auth.orgStatus === 'suspended') {
					return new Response(JSON.stringify({ message: 'Organization suspended.' }), {
						status: 403,
						headers: { 'content-type': 'application/json' }
					});
				}
			}
		}
	}

	return resolve(event);
};
