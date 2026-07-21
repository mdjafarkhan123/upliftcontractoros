import type { OrgMember } from '$lib/types';

export function canViewAnyInvoice(member: OrgMember): boolean {
	return member.can_view_all_invoices;
}

export function canCreateInvoice(member: OrgMember): boolean {
	return member.can_create_invoices;
}

export function canEditInvoice(member: OrgMember): boolean {
	return member.can_create_invoices;
}

export function canSendInvoice(member: OrgMember): boolean {
	return member.can_send_invoices;
}

export function canRecordPayment(member: OrgMember): boolean {
	return member.can_record_payments;
}

export function canCancelInvoice(member: OrgMember): boolean {
	return member.can_delete_invoices;
}

export function canDeleteInvoice(member: OrgMember): boolean {
	return member.can_delete_invoices;
}
