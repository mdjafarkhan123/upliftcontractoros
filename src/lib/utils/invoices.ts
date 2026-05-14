import type { InvoiceStatus } from '$lib/types/invoices';

/**
 * Effective-overdue: true when the invoice is past its due date with a
 * remaining balance, regardless of whether the nightly cron has yet
 * flipped its status to 'overdue'. Use this for UI badges and visual
 * cues so contractors see overdue invoices immediately.
 */
export function isEffectivelyOverdue(
	status: InvoiceStatus,
	dueDate: string | null,
	amountDue: string | number
): boolean {
	if (status === 'overdue') return true;
	if (status !== 'sent' && status !== 'partially_paid') return false;
	if (!dueDate) return false;
	if (Number(amountDue) <= 0) return false;

	const due = new Date(dueDate);
	if (Number.isNaN(due.getTime())) return false;
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	due.setHours(0, 0, 0, 0);
	return due < today;
}
