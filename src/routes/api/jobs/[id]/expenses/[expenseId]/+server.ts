import { json, error } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { jobs, jobExpenses } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canEditJob } from '$lib/server/jobs/permissions';
import { canViewCostMargin } from '$lib/server/finance/permissions';
import { updateJobExpenseSchema } from '$lib/server/jobs/schemas';
import { loadExpensesAndCosting } from '$lib/server/jobs/expenseResponse';

// Resolve the expense + its parent job in one query, then enforce the same two gates as POST
// (can_view_revenue + edit access to the job). Returns null when the expense/job pair isn't
// found under this org (404 handled by callers).
async function loadExpenseForEdit(orgId: string, jobId: string, expenseId: string) {
	const [row] = await db
		.select({ expense_id: jobExpenses.id, job_assigned_to: jobs.assigned_to })
		.from(jobExpenses)
		.innerJoin(jobs, eq(jobs.id, jobExpenses.job_id))
		.where(
			and(
				eq(jobExpenses.id, expenseId),
				eq(jobExpenses.job_id, jobId),
				eq(jobExpenses.org_id, orgId),
				isNull(jobExpenses.deleted_at),
				isNull(jobs.deleted_at)
			)
		)
		.limit(1);
	return row ?? null;
}

export const PATCH: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canViewCostMargin(auth.member)) error(403, 'Forbidden');

	const jobId = event.params.id!;
	const expenseId = event.params.expenseId!;

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		error(400, 'Invalid JSON body');
	}

	const parsed = updateJobExpenseSchema.safeParse(body);
	if (!parsed.success) {
		const field_errors: Record<string, string> = {};
		for (const issue of parsed.error.issues) {
			const p = issue.path.join('.');
			if (p && !field_errors[p]) field_errors[p] = issue.message;
		}
		return json(
			{ error: parsed.error.issues[0]?.message ?? 'Invalid input', field_errors },
			{ status: 422 }
		);
	}
	const input = parsed.data;

	const found = await loadExpenseForEdit(auth.orgId, jobId, expenseId);
	if (!found) error(404, 'Expense not found');
	if (!canEditJob(auth.member, { assigned_to: found.job_assigned_to })) error(403, 'Forbidden');

	const updates: Record<string, unknown> = { updated_at: new Date() };
	if (input.category !== undefined) updates.category = input.category;
	if (input.description !== undefined) updates.description = input.description;
	if (input.amount !== undefined) updates.amount = String(input.amount);
	if (input.expense_date !== undefined) updates.expense_date = input.expense_date;
	if (input.notes !== undefined) updates.notes = input.notes ?? null;

	await db
		.update(jobExpenses)
		.set(updates)
		.where(and(eq(jobExpenses.id, expenseId), eq(jobExpenses.org_id, auth.orgId)));

	const data = await loadExpensesAndCosting(auth.orgId, jobId);
	return json({ data });
};

// Soft-delete (recoverable) — matches the job/line-item recycle-bin model rather than a hard row
// removal. Returns the refreshed { expenses, costing } so the client updates the panel in place.
export const DELETE: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canViewCostMargin(auth.member)) error(403, 'Forbidden');

	const jobId = event.params.id!;
	const expenseId = event.params.expenseId!;

	const found = await loadExpenseForEdit(auth.orgId, jobId, expenseId);
	if (!found) error(404, 'Expense not found');
	if (!canEditJob(auth.member, { assigned_to: found.job_assigned_to })) error(403, 'Forbidden');

	const now = new Date();
	await db
		.update(jobExpenses)
		.set({ deleted_at: now, updated_at: now })
		.where(and(eq(jobExpenses.id, expenseId), eq(jobExpenses.org_id, auth.orgId)));

	const data = await loadExpensesAndCosting(auth.orgId, jobId);
	return json({ data });
};
