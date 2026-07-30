import type { AppointmentStatusJobEcho } from '$lib/types/jobs';

// Jobber's post-completion prompt (VisitActionUponComplete, jobber-04 §3.3): when a visit is
// marked complete it asks "Invoice now / later" and — only if it was the LAST visit — also
// "Close job / Leave open". This module centralises the decision so all three completion
// entry points (calendar popover, job Visits list, appointment detail) agree.

// The permission-carrying subset of the current member. Mirrors the server's canEditJob /
// can_create_invoices gates so the client never offers an action the server will reject.
export type VisitCompleteMember = {
	id: string;
	can_create_invoices: boolean;
	can_view_full_pipeline: boolean;
	can_view_assigned_jobs: boolean;
};

// The invoice choice is offered when billing is configured (frequency !== 'never') and the
// member may invoice. 'never' means the contractor deliberately turned billing off.
export function offersInvoice(
	echo: AppointmentStatusJobEcho,
	member: VisitCompleteMember
): boolean {
	return (
		!!echo &&
		member.can_create_invoices &&
		echo.billing_frequency != null &&
		echo.billing_frequency !== 'never'
	);
}

// The close choice is offered only on the last visit — no scheduled/unscheduled visits remain —
// and only when the member may edit (close) the job. Mirrors server canEditJob. (Creating an
// invoice never closes the job; Jobber keeps them separate — jobber-04 §3.3.)
export function offersClose(echo: AppointmentStatusJobEcho, member: VisitCompleteMember): boolean {
	if (!echo || echo.has_open_visits !== false) return false;
	if (member.can_view_full_pipeline) return true;
	if (member.can_view_assigned_jobs) return echo.assigned_to === member.id;
	return false;
}

// Whether the completion should raise the prompt at all. Callers check this before opening the
// dialog so a non-billable mid-series completion stays silent (exactly as before this feature).
export function shouldPromptVisitComplete(
	echo: AppointmentStatusJobEcho,
	member: VisitCompleteMember
): boolean {
	return offersInvoice(echo, member) || offersClose(echo, member);
}
