import jwt from 'jsonwebtoken';
import type { RequestEvent } from '@sveltejs/kit';
const env = process.env;
import { dev } from '$app/environment';

const COOKIE_NAME = 'jafar_session';
const SESSION_TTL_SECONDS = 60 * 60 * 8; // 8 hours

export type JafarSession = { authenticated: true };

function getSecret(): string {
	const secret = env.SESSION_SECRET;
	if (!secret) throw new Error('SESSION_SECRET is required.');
	return secret;
}

export function getJafarSession(event: RequestEvent): JafarSession | null {
	const token = event.cookies.get(COOKIE_NAME);
	if (!token) return null;
	try {
		jwt.verify(token, getSecret(), { algorithms: ['HS256'] });
		return { authenticated: true };
	} catch {
		return null;
	}
}

export function setJafarSession(event: RequestEvent): void {
	const token = jwt.sign({ jafar: true }, getSecret(), {
		algorithm: 'HS256',
		expiresIn: SESSION_TTL_SECONDS
	});
	event.cookies.set(COOKIE_NAME, token, {
		httpOnly: true,
		secure: !dev,
		sameSite: 'lax',
		path: '/',
		maxAge: SESSION_TTL_SECONDS
	});
}

export function clearJafarSession(event: RequestEvent): void {
	event.cookies.delete(COOKIE_NAME, { path: '/' });
}
