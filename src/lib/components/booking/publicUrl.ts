import { env } from '$env/dynamic/public';

export function bookingPublicUrl(orgSlug: string, linkSlug: string): string {
	const base = env.PUBLIC_APP_URL?.trim().replace(/\/$/, '');
	const origin = base || (typeof window !== 'undefined' ? window.location.origin : '');
	return `${origin}/book/${orgSlug}/${linkSlug}`;
}
