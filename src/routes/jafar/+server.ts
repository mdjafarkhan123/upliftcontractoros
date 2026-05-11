import { redirect } from '@sveltejs/kit';
import bcrypt from 'bcryptjs';
import { verify } from 'otplib';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import {
	checkJafarLoginRateLimit,
	clearJafarLoginRateLimit,
	recordFailedJafarLogin
} from '$lib/server/auth/jafarLoginRateLimit';
import { setJafarSession } from '$lib/server/auth/jafarSession';

function getRequiredEnv(name: string): string {
	const value = env[name];
	if (!value) throw new Error(`${name} is required.`);
	return value;
}

function loginError(message: string): never {
	throw redirect(303, `/jafar?error=${encodeURIComponent(message)}`);
}

function invalidLogin(ip: string): never {
	recordFailedJafarLogin(ip);
	return loginError('Invalid credentials.');
}

export const POST: RequestHandler = async (event) => {
	const ip = event.getClientAddress();
	const rateLimit = checkJafarLoginRateLimit(ip);

	if (!rateLimit.allowed) {
		return loginError(`Too many attempts. Try again in ${rateLimit.retryAfterSeconds} seconds.`);
	}

	const formData = await event.request.formData();
	const email = String(formData.get('email') ?? '').trim();
	const password = String(formData.get('password') ?? '');
	const totp = String(formData.get('totp') ?? '').trim();

	const configuredEmail = getRequiredEnv('SUPER_ADMIN_EMAIL');
	const passwordHash = getRequiredEnv('SUPER_ADMIN_PASSWORD_HASH');
	const totpSecret = getRequiredEnv('SUPER_ADMIN_TOTP_SECRET');

	if (email !== configuredEmail) return invalidLogin(ip);

	const passwordOk = await bcrypt.compare(password, passwordHash);
	if (!passwordOk) return invalidLogin(ip);

	const totpResult = await verify({ token: totp, secret: totpSecret });
	if (!totpResult.valid) return invalidLogin(ip);

	clearJafarLoginRateLimit(ip);
	setJafarSession(event);
	throw redirect(303, '/jafar/dashboard');
};
