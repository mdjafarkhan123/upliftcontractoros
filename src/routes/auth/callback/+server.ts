import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async (event) => {
	const code = event.url.searchParams.get('code');

	if (!code) {
		throw redirect(303, '/auth/login?error=Invalid reset link.');
	}

	const { error } = await event.locals.supabase.auth.exchangeCodeForSession(code);

	if (error) {
		throw redirect(303, '/auth/login?error=Invalid or expired reset link.');
	}

	throw redirect(303, '/change-password');
};
