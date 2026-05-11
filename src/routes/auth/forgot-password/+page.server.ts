import { fail } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { Actions } from './$types';

type ForgotPasswordActionData = {
	error?: string;
	success?: string;
	email?: string;
};

function getRedirectBase(origin: string): string {
	return env.APP_URL || origin;
}

export const actions: Actions = {
	default: async (event) => {
		const formData = await event.request.formData();
		const email = String(formData.get('email') ?? '')
			.trim()
			.toLowerCase();

		if (!email) {
			return fail(400, {
				error: 'Email is required.',
				email
			} satisfies ForgotPasswordActionData);
		}

		const redirectTo = `${getRedirectBase(event.url.origin)}/auth/callback`;
		const { error } = await event.locals.supabase.auth.resetPasswordForEmail(email, {
			redirectTo
		});

		if (error) {
			return fail(400, {
				error: 'Unable to send a reset link. Try again.',
				email
			} satisfies ForgotPasswordActionData);
		}

		return {
			success: 'Check your email for a reset link.',
			email
		} satisfies ForgotPasswordActionData;
	}
};
