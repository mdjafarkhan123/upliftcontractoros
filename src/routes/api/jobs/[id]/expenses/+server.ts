import { json, error } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { jobs, jobExpenses } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canEditJob } from '$lib/server/jobs/permissions';
import { canViewCostMargin } from '$lib/server/finance/permissions';
import { createJobExpenseSchema } from '$lib/server/jobs/schemas';
import { loadExpensesAndCosting } from '$lib/server/jobs/expenseResponse';

// Log a job cost. Gated twice: can_view_revenue (cost data is private) AND edit access to this
// job. Allowed on jobs of ANY status — contractors reconcile receipts after a job closes, so we
// never block costing on completion (matches Jobber).
export const POST: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canViewCostMargin(auth.member)) error(403, 'Forbidden');

	const id = event.params.id!;

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		error(400, 'Invalid JSON body');
	}

	const parsed = createJobExpenseSchema.safeParse(body);
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

	const [job] = await db
		.select({ id: jobs.id, assigned_to: jobs.assigned_to })
		.from(jobs)
		.where(and(eq(jobs.id, id), eq(jobs.org_id, auth.orgId), isNull(jobs.deleted_at)))
		.limit(1);
	if (!job) error(404, 'Job not found');
	if (!canEditJob(auth.member, { assigned_to: job.assigned_to })) error(403, 'Forbidden');

	await db.insert(jobExpenses).values({
		org_id: auth.orgId,
		job_id: id,
		category: input.category,
		description: input.description,
		amount: String(input.amount),
		expense_date: input.expense_date,
		notes: input.notes ?? null,
		created_by: auth.member.id
	});

	const data = await loadExpensesAndCosting(auth.orgId, id);
	return json({ data }, { status: 201 });
};
