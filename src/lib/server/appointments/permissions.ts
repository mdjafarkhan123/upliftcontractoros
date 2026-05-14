import type { OrgMember } from '$lib/types';

export function canViewAnyAppointment(member: OrgMember): boolean {
	return member.can_view_all_appointments || member.can_view_assigned_appointments;
}

export function canViewAppointment(
	member: OrgMember,
	appt: { assigned_to: string | null }
): boolean {
	if (member.can_view_all_appointments) return true;
	if (member.can_view_assigned_appointments) return appt.assigned_to === member.id;
	return false;
}

export function canCreateAppointment(member: OrgMember): boolean {
	return member.can_create_appointments;
}

export function canRescheduleAppointment(member: OrgMember): boolean {
	return member.can_reschedule_appointments;
}
