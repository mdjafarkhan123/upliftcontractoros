import type { PageLoad } from './$types';

export const ssr = false;

export const load: PageLoad = ({ url }) => {
	return {
		q: url.searchParams.get('q') ?? '',
		statusFilter: (url.searchParams.get('status') as 'all' | 'leads' | 'customers') ?? 'all'
	};
};
