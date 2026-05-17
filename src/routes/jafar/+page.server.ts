import { fail, redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { Actions, PageServerLoad } from './$types';
import { setJafarSession } from '$lib/server/auth/jafarSession';

function getRequiredEnv(name: string): string {
	const value = env[name];
	if (!value) throw new Error(`${name} is required.`);
	return value;
}

export const load: PageServerLoad = ({ url }) => ({
	errorMessage: url.searchParams.get('error')
});

export const actions: Actions = {
	default: async (event) => {
		const formData = await event.request.formData();
		const email = String(formData.get('email') ?? '').trim();
		const password = String(formData.get('password') ?? '');

		const configuredEmail = getRequiredEnv('SUPER_ADMIN_EMAIL');
		const configuredPassword = getRequiredEnv('SUPER_ADMIN_PASSWORD');

		if (email !== configuredEmail || password !== configuredPassword) {
			return fail(401, { errorMessage: 'Invalid credentials.' });
		}

		setJafarSession(event);
		throw redirect(303, '/jafar/dashboard');
	}
};
