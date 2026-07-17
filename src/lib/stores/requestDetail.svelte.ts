import { createDetailCache } from './detailCache.svelte';
import type { RequestDetail } from '$lib/types/requests';

async function fetchRequestDetail(id: string, signal: AbortSignal): Promise<RequestDetail> {
	const res = await fetch(`/api/requests/${id}`, { signal });
	if (res.status === 404) throw new Error('Request not found.');
	if (res.status === 403) throw new Error('You do not have access to this request.');
	if (!res.ok) throw new Error('Failed to load request.');
	const body = (await res.json()) as { data: RequestDetail };
	return body.data;
}

export const requestDetailStore = createDetailCache(fetchRequestDetail);
