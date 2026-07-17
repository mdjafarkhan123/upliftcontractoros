import { alias } from 'drizzle-orm/pg-core';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { jobExpenses, jobLineItems, jobTimeEntries, jobs, orgMembers } from '$lib/server/db/schema';
import { computeJobCosting } from './costing';
import type { JobCosting, JobTimeEntryRow } from '$lib/types/jobs';

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Re-read a job's time entries and recompute its costing after a time-entry mutation, mirroring
 * `loadExpensesAndCosting`. `canCost` gates whether the caller may see the $ side of time
 * tracking (hourly_rate_snapshot / cost_amount / costing) — hours worked stay visible to anyone
 * who can view the job either way, since a tech should see their own logged time.
 */
export async function loadTimeEntriesAndCosting(
	orgId: string,
	jobId: string,
	canCost: boolean
): Promise<{ time_entries: JobTimeEntryRow[]; costing: JobCosting | null }> {
	const createdByMember = alias(orgMembers, 'created_by_member');

	// PERFORMANCE: the time-entry rows and the three costing inputs (job totals, line-item costs,
	// expenses) are mutually independent, so fetch them in one concurrent wave rather than a 4-deep
	// waterfall. The costing inputs are only needed — and only fetched — when `canCost`; otherwise
	// they resolve to [] with no DB call, preserving the original cost-gating exactly.
	const [rows, jobRows, costLineItems, costExpenses] = await Promise.all([
		db
			.select({
				id: jobTimeEntries.id,
				org_member_id: jobTimeEntries.org_member_id,
				member_name: orgMembers.full_name,
				clock_in: jobTimeEntries.clock_in,
				clock_out: jobTimeEntries.clock_out,
				duration_minutes: jobTimeEntries.duration_minutes,
				hourly_rate_snapshot: jobTimeEntries.hourly_rate_snapshot,
				notes: jobTimeEntries.notes,
				created_by_name: createdByMember.full_name,
				created_at: jobTimeEntries.created_at
			})
			.from(jobTimeEntries)
			.innerJoin(orgMembers, eq(orgMembers.id, jobTimeEntries.org_member_id))
			.leftJoin(createdByMember, eq(createdByMember.id, jobTimeEntries.created_by))
			.where(
				and(
					eq(jobTimeEntries.job_id, jobId),
					eq(jobTimeEntries.org_id, orgId),
					isNull(jobTimeEntries.deleted_at)
				)
			)
			.orderBy(desc(jobTimeEntries.clock_in)),

		canCost
			? db
					.select({ subtotal: jobs.subtotal, discount_amount: jobs.discount_amount })
					.from(jobs)
					.where(and(eq(jobs.id, jobId), eq(jobs.org_id, orgId)))
					.limit(1)
			: Promise.resolve([] as { subtotal: string; discount_amount: string | null }[]),

		canCost
			? db
					.select({ quantity: jobLineItems.quantity, unit_cost: jobLineItems.unit_cost })
					.from(jobLineItems)
					.where(
						and(
							eq(jobLineItems.job_id, jobId),
							eq(jobLineItems.org_id, orgId),
							isNull(jobLineItems.deleted_at)
						)
					)
			: Promise.resolve([] as { quantity: string; unit_cost: string | null }[]),

		canCost
			? db
					.select({ amount: jobExpenses.amount })
					.from(jobExpenses)
					.where(
						and(
							eq(jobExpenses.job_id, jobId),
							eq(jobExpenses.org_id, orgId),
							isNull(jobExpenses.deleted_at)
						)
					)
			: Promise.resolve([] as { amount: string }[])
	]);

	const time_entries: JobTimeEntryRow[] = rows.map((r) => {
		const costAmount =
			r.duration_minutes != null && r.hourly_rate_snapshot != null
				? round2((Number(r.duration_minutes) / 60) * Number(r.hourly_rate_snapshot)).toFixed(2)
				: null;
		return {
			id: r.id,
			org_member_id: r.org_member_id,
			member_name: r.member_name,
			clock_in: r.clock_in.toISOString(),
			clock_out: r.clock_out ? r.clock_out.toISOString() : null,
			duration_minutes: r.duration_minutes,
			hourly_rate_snapshot: canCost ? r.hourly_rate_snapshot : null,
			cost_amount: canCost ? costAmount : null,
			notes: r.notes,
			created_by_name: r.created_by_name,
			created_at: r.created_at.toISOString()
		};
	});

	let costing: JobCosting | null = null;
	if (canCost) {
		const job = jobRows[0];
		costing = computeJobCosting({
			subtotal: job?.subtotal ?? '0',
			discount_amount: job?.discount_amount ?? null,
			lineItems: costLineItems,
			expenses: costExpenses,
			timeEntries: rows.map((r) => ({
				duration_minutes: r.duration_minutes,
				hourly_rate_snapshot: r.hourly_rate_snapshot
			}))
		});
	}

	return { time_entries, costing };
}
