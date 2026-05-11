import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

async function logout(event: Parameters<RequestHandler>[0]): Promise<never> {
	await event.locals.supabase.auth.signOut();
	throw redirect(303, '/auth/login');
}

export const GET: RequestHandler = logout;
export const POST: RequestHandler = logout;
