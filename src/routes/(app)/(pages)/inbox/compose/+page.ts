import type { PageLoad } from './$types';

export const ssr = false;

export const load: PageLoad = ({ url }) => {
	return {
		contactId: url.searchParams.get('contact_id') ?? '',
		contactName: url.searchParams.get('name') ?? '',
		contactPhone: url.searchParams.get('phone') ?? ''
	};
};
