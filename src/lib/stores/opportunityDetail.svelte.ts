import { createDetailCache } from './detailCache.svelte';
import type { OpportunityDetail } from '$lib/types/pipeline';

async function fetchOpportunityDetail(id: string, signal: AbortSignal): Promise<OpportunityDetail> {
	const res = await fetch(`/api/pipeline/opportunities/${id}`, { signal });
	if (res.status === 404) throw new Error('Opportunity not found.');
	if (!res.ok) throw new Error('Failed to load opportunity.');
	const body = (await res.json()) as { opportunity: OpportunityDetail };
	return body.opportunity;
}

export const opportunityDetailStore = createDetailCache(fetchOpportunityDetail);
