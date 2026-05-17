import { fail, redirect } from '@sveltejs/kit';
import bcrypt from 'bcryptjs';
import { verify } from 'otplib';
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
		const totp = String(formData.get('totp') ?? '').trim();

		const configuredEmail = getRequiredEnv('SUPER_ADMIN_EMAIL');
		const passwordHash = getRequiredEnv('SUPER_ADMIN_PASSWORD_HASH');
		const totpSecret = getRequiredEnv('SUPER_ADMIN_TOTP_SECRET');

		const invalid = () => fail(401, { errorMessage: 'Invalid credentials.' });

		if (email !== configuredEmail) return invalid();

		const passwordOk = await bcrypt.compare(password, passwordHash);
		if (!passwordOk) return invalid();

		const totpResult = await verify({ token: totp, secret: totpSecret });
		if (!totpResult.valid) return invalid();

		setJafarSession(event);
		throw redirect(303, '/jafar/dashboard');
	}
};
