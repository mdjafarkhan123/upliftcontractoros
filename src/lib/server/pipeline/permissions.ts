import type { OrgMember } from '$lib/types';

export type PipelineScope = 'all' | 'mine' | 'none';

export function pipelineScopeFor(member: OrgMember): PipelineScope {
	if (member.can_view_full_pipeline) return 'all';
	if (member.can_view_assigned_opportunities) return 'mine';
	return 'none';
}

export function canViewAnyOpportunity(member: OrgMember): boolean {
	return pipelineScopeFor(member) !== 'none';
}

export function canViewOpportunity(
	member: OrgMember,
	opp: { assigned_to: string | null }
): boolean {
	const scope = pipelineScopeFor(member);
	if (scope === 'all') return true;
	if (scope === 'mine') return opp.assigned_to === member.id;
	return false;
}
