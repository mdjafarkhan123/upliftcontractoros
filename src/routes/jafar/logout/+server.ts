import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { clearJafarSession } from '$lib/server/auth/jafarSession';

export const POST: RequestHandler = (event) => {
	clearJafarSession(event);
	throw redirect(303, '/jafar');
};
