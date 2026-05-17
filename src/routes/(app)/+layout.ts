import type { LayoutLoad } from './$types';
import { sessionStore, type AppSessionData } from '$lib/stores/session.svelte';

export type { AppSessionData };

// Server load (+layout.server.ts) already produced the session from
// event.locals.auth — no network call needed on boot. We just seed the
// rune store synchronously so the rest of the app can read it.
// /api/session is reserved for later refreshes (polling, mutations).
export const load: LayoutLoad = ({ data }) => {
	sessionStore.update(data.session);
	return { session: data.session };
};
