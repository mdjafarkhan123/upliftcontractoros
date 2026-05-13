import { redirect, error } from '@sveltejs/kit';
import type { LayoutLoad } from './$types';
import { sessionStore, type AppSessionData } from '$lib/stores/session.svelte';

export type { AppSessionData };

export const load: LayoutLoad = async () => {
	const session = await sessionStore.load();
	if (sessionStore.status === 'unauthorized') throw redirect(302, '/auth/login');
	if (!session) throw error(500, sessionStore.error ?? 'Failed to load session');
	return { session };
};
