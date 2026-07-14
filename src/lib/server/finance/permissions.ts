import type { OrgMember } from '$lib/types';

/**
 * Cost & profit-margin visibility rides on the existing revenue permission: a member
 * allowed to see money numbers (`can_view_revenue`) may also see what work COSTS the
 * business and its profit margin. This is the sole gate for unit_cost across quotes,
 * jobs, and the price book.
 *
 * Robustness contract (defense-in-depth, so a field tech can price/edit work without
 * ever touching the owner's private cost data):
 *   1. READS  — every endpoint that returns line items or catalog items strips
 *               `unit_cost` to null when this returns false, so cost never reaches
 *               an unauthorised browser.
 *   2. WRITES — the quote/job PATCH handlers PRESERVE the existing unit_cost by
 *               line_key when the editor lacks this permission, so a non-revenue
 *               member saving an edit can never blank out the owner's costs.
 */
export function canViewCostMargin(member: OrgMember): boolean {
	return member.can_view_revenue;
}
