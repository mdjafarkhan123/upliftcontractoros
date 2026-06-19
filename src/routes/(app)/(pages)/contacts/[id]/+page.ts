import type { PageLoad } from './$types';

export const ssr = false;

// The detail store owns this type now; re-exported here for existing importers
// (e.g. the edit page imports it from `../+page`).
export type { ContactDetailResponse } from '$lib/stores/contactDetail.svelte';

export const load: PageLoad = ({ params }) => {
	return { id: params.id };
};
