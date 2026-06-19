import { browser } from '$app/environment';
import type { LayoutLoad } from './$types';
import { sessionStore, type AppSessionData } from '$lib/stores/session.svelte';

export type { AppSessionData };

// Server load (+layout.server.ts) already produced the session from
// event.locals.auth — no network call needed on boot. We seed the rune
// store on the CLIENT ONLY: the store uses module-level $state shared
// across all server requests in one process, so writing it on the server
// would leak one user's session into another's render. The layout falls
// back to per-request `data.session` (sessionStore.data ?? data.session),
// so the server renders correctly without the store write.
// /api/session is reserved for later refreshes (polling, mutations).
export const load: LayoutLoad = ({ data }) => {
	if (browser) sessionStore.update(data.session);
	return { session: data.session };
};
