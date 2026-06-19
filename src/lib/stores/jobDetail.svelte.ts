import { createDetailCache } from './detailCache.svelte';
import type { JobDetail } from '$lib/types/jobs';

async function fetchJobDetail(id: string, signal: AbortSignal): Promise<JobDetail> {
	const res = await fetch(`/api/jobs/${id}`, { signal });
	if (res.status === 404) throw new Error('Job not found.');
	if (res.status === 403) throw new Error('You do not have access to this job.');
	if (!res.ok) throw new Error('Failed to load job.');
	const body = (await res.json()) as { job: JobDetail };
	return body.job;
}

export const jobDetailStore = createDetailCache(fetchJobDetail);
