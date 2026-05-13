import type { PageLoad } from './$types';

export const ssr = false;

export const load: PageLoad = ({ url }) => {
	const filter = (url.searchParams.get('filter') ?? 'all') as
		| 'all'
		| 'unread'
		| 'sms'
		| 'missed_calls';
	return {
		filter,
		q: url.searchParams.get('q') ?? ''
	};
};
