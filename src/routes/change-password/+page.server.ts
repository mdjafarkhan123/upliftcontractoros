import { fail, redirect } from '@sveltejs/kit';
import type { Actions } from './$types';
import { createServiceClient } from '$lib/server/auth/supabase';
import { getContractorSession } from '$lib/server/auth/session';

type ChangePasswordActionData = {
	error?: string;
};

export const actions: Actions = {
	default: async (event) => {
		const contractorSession = await getContractorSession(event);
		if (!contractorSession) throw redirect(303, '/auth/login');

		if (contractorSession.supabaseUser.app_metadata.password_changed) {
			throw redirect(303, '/dashboard');
		}

		const formData = await event.request.formData();
		const password = String(formData.get('password') ?? '');
		const confirmPassword = String(formData.get('confirm_password') ?? '');

		if (password.length < 8) {
			return fail(400, {
				error: 'Password must be at least 8 characters.'
			} satisfies ChangePasswordActionData);
		}

		if (password !== confirmPassword) {
			return fail(400, {
				error: 'Passwords do not match.'
			} satisfies ChangePasswordActionData);
		}

		const { error: updatePasswordError } = await event.locals.supabase.auth.updateUser({
			password
		});

		if (updatePasswordError) {
			return fail(400, {
				error: 'Unable to update password. Try again.'
			} satisfies ChangePasswordActionData);
		}

		const serviceClient = createServiceClient();
		const { error: metadataError } = await serviceClient.auth.admin.updateUserById(
			contractorSession.supabaseUser.id,
			{
				app_metadata: {
					...contractorSession.supabaseUser.app_metadata,
					password_changed: true
				}
			}
		);

		if (metadataError) {
			return fail(500, {
				error: 'Password updated, but account setup could not be completed. Contact support.'
			} satisfies ChangePasswordActionData);
		}

		throw redirect(303, '/dashboard');
	}
};
