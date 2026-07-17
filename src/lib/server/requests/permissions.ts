import type { OrgMember } from '$lib/types';

// Requests are lead intake — the front of the pipeline — so they reuse the
// pipeline authority the same way jobs do (no dedicated can_*_requests booleans
// yet; R5's polish pass decides whether to add them). Requests carry no
// assigned_to in R1, so there is no assigned-only view tier: you either see the
// org's incoming work or you don't.
export function canViewRequests(member: OrgMember): boolean {
	return member.can_view_full_pipeline;
}

// Create / edit / accept / decline / archive / delete.
export function canManageRequests(member: OrgMember): boolean {
	return member.can_view_full_pipeline;
}
