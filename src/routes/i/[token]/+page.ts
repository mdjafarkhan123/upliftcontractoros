export const ssr = false;

import type { PageLoad } from './$types';

export const load: PageLoad = async ({ params, fetch }) => {
	const res = await fetch(`/i/${params.token}/data`);
	if (!res.ok) return { invoice: null };
	const body = await res.json().catch(() => null);
	return { invoice: body?.data ?? null };
};
