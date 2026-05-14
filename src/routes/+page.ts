import { redirect } from '@sveltejs/kit';

export const load = async ({ fetch }) => {
	const res = await fetch('/api/session');
	throw redirect(307, res.ok ? '/dashboard' : '/auth/login');
};
