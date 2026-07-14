import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { jobExpenses, jobLineItems, jobTimeEntries, jobs, orgMembers } from '$lib/server/db/schema';
import { computeJobCosting } from './costing';
import type { JobCosting, JobExpenseRow } from '$lib/types/jobs';

/**
 * Re-read a job's expenses and recompute its costing after an expense mutation, so the
 * expense routes can echo the authoritative { expenses, costing } back to the client in one
 * shot (no follow-up job refetch). Callers MUST have already gated on can_view_revenue —
 * this returns private cost data unconditionally.
 */
export async function loadExpensesAndCosting(
	orgId: string,
	jobId: string
): Promise<{ expenses: JobExpenseRow[]; costing: JobCosting }> {
	const rows = await db
		.select({
			id: jobExpenses.id,
			category: jobExpenses.category,
			description: jobExpenses.description,
			amount: jobExpenses.amount,
			expense_date: jobExpenses.expense_date,
			notes: jobExpenses.notes,
			created_by_name: orgMembers.full_name,
			created_at: jobExpenses.created_at
		})
		.from(jobExpenses)
		.leftJoin(orgMembers, eq(orgMembers.id, jobExpenses.created_by))
		.where(
			and(
				eq(jobExpenses.job_id, jobId),
				eq(jobExpenses.org_id, orgId),
				isNull(jobExpenses.deleted_at)
			)
		)
		.orderBy(desc(jobExpenses.expense_date), desc(jobExpenses.created_at));

	const expenses: JobExpenseRow[] = rows.map((r) => ({
		...r,
		created_at: r.created_at.toISOString()
	}));

	const [job] = await db
		.select({ subtotal: jobs.subtotal, discount_amount: jobs.discount_amount })
		.from(jobs)
		.where(and(eq(jobs.id, jobId), eq(jobs.org_id, orgId)))
		.limit(1);

	const lineItems = await db
		.select({ quantity: jobLineItems.quantity, unit_cost: jobLineItems.unit_cost })
		.from(jobLineItems)
		.where(and(eq(jobLineItems.job_id, jobId), isNull(jobLineItems.deleted_at)));

	const timeEntries = await db
		.select({
			duration_minutes: jobTimeEntries.duration_minutes,
			hourly_rate_snapshot: jobTimeEntries.hourly_rate_snapshot
		})
		.from(jobTimeEntries)
		.where(and(eq(jobTimeEntries.job_id, jobId), isNull(jobTimeEntries.deleted_at)));

	const costing = computeJobCosting({
		subtotal: job?.subtotal ?? '0',
		discount_amount: job?.discount_amount ?? null,
		lineItems,
		expenses,
		timeEntries
	});

	return { expenses, costing };
}
