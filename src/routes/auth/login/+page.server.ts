import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

type LoginActionData = {
	error?: string;
	email?: string;
};

export const load: PageServerLoad = ({ url }) => {
	return {
		errorMessage: url.searchParams.get('error')
	};
};

export const actions: Actions = {
	default: async (event) => {
		const formData = await event.request.formData();
		const email = String(formData.get('email') ?? '')
			.trim()
			.toLowerCase();
		const password = String(formData.get('password') ?? '');

		if (!email || !password) {
			return fail(400, {
				error: 'Email and password are required.',
				email
			} satisfies LoginActionData);
		}

		const { error } = await event.locals.supabase.auth.signInWithPassword({
			email,
			password
		});

		if (error) {
			return fail(400, {
				error: 'Invalid email or password.',
				email
			} satisfies LoginActionData);
		}

		throw redirect(303, '/dashboard');
	}
};
