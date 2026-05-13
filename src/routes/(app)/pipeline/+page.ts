import type { PageLoad } from './$types';

export const ssr = false;

export const load: PageLoad = () => {
	return {} as Record<string, never>;
};
