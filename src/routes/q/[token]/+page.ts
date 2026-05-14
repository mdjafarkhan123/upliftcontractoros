import type { PageLoad } from './$types';

export const ssr = false;

export const load: PageLoad = async ({ params, fetch }) => {
	const res = await fetch(`/q/${params.token}/data`);
	if (!res.ok) {
		return { quote: null };
	}
	const body = await res.json();
	return { quote: body.data };
};
