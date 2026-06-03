import type { OrgMember } from '$lib/types';

export function canViewAnyJob(member: OrgMember): boolean {
	return member.can_view_full_pipeline || member.can_view_assigned_jobs;
}

export function canViewJob(member: OrgMember, job: { assigned_to: string | null }): boolean {
	if (member.can_view_full_pipeline) return true;
	if (member.can_view_assigned_jobs) return job.assigned_to === member.id;
	return false;
}

export function canEditJob(member: OrgMember, job: { assigned_to: string | null }): boolean {
	if (member.can_view_full_pipeline) return true;
	if (member.can_view_assigned_jobs) return job.assigned_to === member.id;
	return false;
}

export function canCancelJob(member: OrgMember): boolean {
	return member.can_view_full_pipeline;
}
