import { json, error } from '@sveltejs/kit';
import { sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { invoices, payments } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canViewAnyInvoice } from '$lib/server/invoices/permissions';
import type { InvoiceStats } from '$lib/types/invoices';

// Org-wide invoice AR summary for the KPI strip above the invoices list.
// Read-only. Two filtered-aggregate passes: one over invoices (outstanding,
// overdue, avg-days-to-pay), one over payments (cash collected this month).
export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canViewAnyInvoice(auth.member)) error(403, 'Forbidden');

	// Effective-overdue mirrors isEffectivelyOverdue() + the list's `overdue`
	// filter: actual 'overdue' status OR sent/partially_paid past due with a balance.
	const overdueCond = sql`(
		${invoices.status} = 'overdue'
		OR (
			${invoices.status} IN ('sent', 'partially_paid')
			AND ${invoices.due_date} IS NOT NULL
			AND ${invoices.due_date} < CURRENT_DATE
			AND ${invoices.amount_due} > 0
		)
	)`;

	const [inv] = await db.execute<{
		outstanding_total: string;
		overdue_total: string;
		overdue_count: string;
		avg_days_to_pay: string | null;
	}>(sql`
		SELECT
			COALESCE(
				SUM(${invoices.amount_due}) FILTER (
					WHERE ${invoices.status} IN ('sent', 'partially_paid', 'overdue')
				), 0
			)::text AS outstanding_total,
			COALESCE(SUM(${invoices.amount_due}) FILTER (WHERE ${overdueCond}), 0)::text AS overdue_total,
			COUNT(*) FILTER (WHERE ${overdueCond}) AS overdue_count,
			AVG(EXTRACT(EPOCH FROM (${invoices.paid_at} - ${invoices.sent_at})) / 86400.0) FILTER (
				WHERE ${invoices.status} = 'paid'
					AND ${invoices.paid_at} >= now() - interval '90 days'
					AND ${invoices.sent_at} IS NOT NULL
			) AS avg_days_to_pay
		FROM ${invoices}
		WHERE ${invoices.org_id} = ${auth.orgId}
			AND ${invoices.deleted_at} IS NULL
	`);

	const [pay] = await db.execute<{ paid_this_month: string }>(sql`
		SELECT COALESCE(SUM(${payments.amount}), 0)::text AS paid_this_month
		FROM ${payments}
		INNER JOIN ${invoices} ON ${invoices.id} = ${payments.invoice_id}
		WHERE ${payments.org_id} = ${auth.orgId}
			AND ${invoices.deleted_at} IS NULL
			AND ${payments.paid_at} >= date_trunc('month', now())
	`);

	const data: InvoiceStats = {
		outstanding_total: inv?.outstanding_total ?? '0',
		overdue_total: inv?.overdue_total ?? '0',
		overdue_count: Number(inv?.overdue_count ?? 0),
		paid_this_month: pay?.paid_this_month ?? '0',
		avg_days_to_pay: inv?.avg_days_to_pay != null ? Number(inv.avg_days_to_pay) : null
	};

	return json({ data });
};
