import { createDetailCache } from './detailCache.svelte';
import type { OrgMember } from '$lib/types';

async function fetchTeamMember(id: string, signal: AbortSignal): Promise<OrgMember> {
	const res = await fetch(`/api/team/${id}`, { signal });
	if (res.status === 404) throw new Error('Team member not found.');
	if (res.status === 403) throw new Error('You do not have access.');
	if (!res.ok) throw new Error('Failed to load team member.');
	const body = (await res.json()) as { data: OrgMember };
	return body.data;
}

export const teamDetailStore = createDetailCache(fetchTeamMember);
