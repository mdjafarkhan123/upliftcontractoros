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

// Job form templates are org-wide reusable assets (like the price book / quote
// templates). Anyone who works jobs may browse and use them; building/editing/deleting
// them is a management action, gated to full-pipeline members — the same authority
// that can cancel a job. There is no dedicated permission boolean (mirrors how the
// price book reuses quote perms rather than adding a new one).
export function canViewJobFormTemplates(member: OrgMember): boolean {
	return member.can_view_full_pipeline || member.can_view_assigned_jobs;
}

export function canManageJobFormTemplates(member: OrgMember): boolean {
	return member.can_view_full_pipeline;
}

// Job custom fields are org-wide job metadata definitions (Jobber "Custom Fields"),
// managed in Settings. Same authority model as job form templates / the price book:
// anyone who works jobs can see the fields (they're rendered on the job), but building
// and editing the definitions is a management action gated to full-pipeline members. No
// dedicated permission boolean (mirrors job form templates).
export function canViewJobCustomFields(member: OrgMember): boolean {
	return member.can_view_full_pipeline || member.can_view_assigned_jobs;
}

export function canManageJobCustomFields(member: OrgMember): boolean {
	return member.can_view_full_pipeline;
}
