import { redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { Handle } from '@sveltejs/kit';
import { createServerClient } from '$lib/server/auth/supabase';
import { getJafarSession } from '$lib/server/auth/jafarSession';

export const handle: Handle = async ({ event, resolve }) => {
	const { pathname } = event.url;

	// 1. Attach supabase client and safeGetSession to locals for downstream use
	const supabase = createServerClient(event);
	event.locals.supabase = supabase;

	const {
		data: { session }
	} = await supabase.auth.getSession();

	if (session) {
		const {
			data: { user }
		} = await supabase.auth.getUser();
		event.locals.safeSession = user ? session : null;
	} else {
		event.locals.safeSession = null;
	}

	// 2. /jafar and /api/admin route protection — isolated from contractor auth
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

	// 3 & 4. Contractor session checks apply only to app routes
	// App routes = everything except /auth/*, /jafar*, /q/*, /change-password, /api/*
	if (pathname === '/change-password') {
		const [{ getContractorSession }, { db }, { organizations }] = await Promise.all([
			import('$lib/server/auth/session'),
			import('$lib/server/db/client'),
			import('$lib/server/db/schema')
		]);
		const contractorSession = await getContractorSession(event);

		if (!contractorSession) throw redirect(302, '/auth/login');

		event.locals.contractorSession = contractorSession;

		const [org] = await db
			.select({ status: organizations.status })
			.from(organizations)
			.where(eq(organizations.id, contractorSession.orgId))
			.limit(1);

		if (org?.status === 'suspended') throw redirect(302, '/auth/suspended');

		if (contractorSession.supabaseUser.app_metadata.password_changed) {
			throw redirect(302, '/dashboard');
		}
	}

	const isAppRoute =
		!pathname.startsWith('/auth') &&
		!pathname.startsWith('/jafar') &&
		!pathname.startsWith('/q/') &&
		pathname !== '/change-password' &&
		!pathname.startsWith('/api/');

	if (isAppRoute) {
		const [{ getContractorSession }, { db }, { organizations }] = await Promise.all([
			import('$lib/server/auth/session'),
			import('$lib/server/db/client'),
			import('$lib/server/db/schema')
		]);
		const contractorSession = await getContractorSession(event);

		// 4. No valid session → redirect to login
		if (!contractorSession) throw redirect(302, '/auth/login');

		event.locals.contractorSession = contractorSession;

		// 3. Org suspension guard
		const [org] = await db
			.select({ status: organizations.status })
			.from(organizations)
			.where(eq(organizations.id, contractorSession.orgId))
			.limit(1);

		if (org?.status === 'suspended') throw redirect(302, '/auth/suspended');

		// 4. First-login password change guard
		if (!contractorSession.supabaseUser.app_metadata.password_changed) {
			throw redirect(302, '/change-password');
		}
	}

	return resolve(event);
};
