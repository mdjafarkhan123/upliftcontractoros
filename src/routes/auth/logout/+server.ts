import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async (event) => {
	await event.locals.supabase.auth.signOut();
	throw redirect(303, '/auth/login');
};
