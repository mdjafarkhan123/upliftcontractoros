import type { OrgMember } from '$lib/types';

export function canViewAnyQuote(member: OrgMember): boolean {
	return member.can_view_all_quotes;
}

export function canCreateQuote(member: OrgMember): boolean {
	return member.can_create_quotes;
}

export function canEditQuote(member: OrgMember): boolean {
	return member.can_edit_quotes;
}

export function canSendQuote(member: OrgMember): boolean {
	return member.can_send_quotes;
}

export function canDeleteQuote(member: OrgMember): boolean {
	return member.can_delete_quotes;
}

export function canViewTemplates(member: OrgMember): boolean {
	return member.can_view_all_quotes;
}

export function canManageTemplates(member: OrgMember): boolean {
	return member.can_create_quotes;
}
