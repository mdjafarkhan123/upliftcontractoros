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
	return member.can_create_quotes || member.can_edit_quotes;
}

export function canManageTemplates(member: OrgMember): boolean {
	return member.can_edit_quotes;
}

// Catalog: anyone who can build quotes may browse it and save items to it (the
// catalog grows from real quoting work). Editing/archiving existing items in
// Settings is a management action gated to quote editors.
export function canViewCatalog(member: OrgMember): boolean {
	return member.can_create_quotes || member.can_edit_quotes;
}

export function canCreateCatalogItem(member: OrgMember): boolean {
	return member.can_create_quotes || member.can_edit_quotes;
}

export function canManageCatalog(member: OrgMember): boolean {
	return member.can_edit_quotes;
}
