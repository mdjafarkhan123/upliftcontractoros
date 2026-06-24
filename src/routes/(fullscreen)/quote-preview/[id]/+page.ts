import type { PageLoad } from './$types';

// CSR only — the authenticated preview feed is fetched in the browser with the member's
// session cookie (same pattern as the public /q page).
export const ssr = false;

export const load: PageLoad = async ({ params, fetch }) => {
	const res = await fetch(`/api/quotes/${params.id}/preview`);
	if (!res.ok) return { quote: null };
	const body = await res.json();
	return { quote: body.data };
};
