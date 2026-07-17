import { json, error } from '@sveltejs/kit';
import { and, asc, eq, isNull } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { jobs, jobLineItems } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { recalcJobTotals } from '$lib/server/jobs/recalc';

// Duplicate a job — the Jobber / Housecall Pro "Copy job" pattern. The new job copies the
// WORK (title, line items, pricing rule, tags, scope, service address, assignee) but lands
// UNSCHEDULED: no dates, no recurrence, no visits on the calendar, and NO client
// notifications. The contractor schedules the copy fresh. Keeping it side-effect-free is
// deliberate — a copy must never fire reminders or regenerate a whole recurring visit series.
//
// This is also the sanctioned way to CHANGE a job's one-off/recurring type, which PATCH
// forbids: pass an optional `job_type` in the body to create the copy as the other type.
// That's safe precisely because a duplicate carries no rule and no visits, so there is
// nothing to reconcile — omit it and the source's type is kept.
export const POST: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!auth.member.can_view_full_pipeline) error(403, 'Forbidden');

	const id = event.params.id!;

	// Body is optional — a plain copy sends none.
	let jobTypeOverride: 'one_off' | 'recurring' | null = null;
	const raw = await event.request.text();
	if (raw.trim()) {
		let body: unknown;
		try {
			body = JSON.parse(raw);
		} catch {
			error(400, 'Invalid JSON body');
		}
		const sent = (body as { job_type?: unknown } | null)?.job_type;
		if (sent !== undefined) {
			if (sent !== 'one_off' && sent !== 'recurring') {
				return json(
					{
						error: 'Invalid job type.',
						field_errors: { job_type: 'Choose one-off or recurring.' }
					},
					{ status: 422 }
				);
			}
			jobTypeOverride = sent;
		}
	}

	const [source] = await db
		.select()
		.from(jobs)
		.where(and(eq(jobs.id, id), eq(jobs.org_id, auth.orgId), isNull(jobs.deleted_at)))
		.limit(1);
	if (!source) error(404, 'Job not found');

	const sourceLines = await db
		.select()
		.from(jobLineItems)
		.where(and(eq(jobLineItems.job_id, id), eq(jobLineItems.org_id, auth.orgId)))
		.orderBy(asc(jobLineItems.position));

	const created = await db.transaction(async (tx) => {
		const [row] = await tx
			.insert(jobs)
			.values({
				org_id: auth.orgId,
				opportunity_id: null,
				source: 'manual',
				contact_id: source.contact_id,
				title: `${source.title} (Copy)`,
				// 'scheduled' enum + null start = the derived "Pending" (unscheduled) state.
				status: 'scheduled',
				assigned_to: source.assigned_to,
				// The copy keeps the source's type unless the caller deliberately switches it.
				job_type: jobTypeOverride ?? source.job_type,
				job_category: source.job_category,
				tags: source.tags ?? [],
				notes: source.notes,
				scope_of_work: source.scope_of_work,
				// Pricing rule is copied; the money columns are recomputed from the copied lines
				// below via recalcJobTotals so subtotal/discount/tax/total can't drift.
				discount_type: source.discount_type,
				discount_value: source.discount_value,
				discount_label: source.discount_label,
				tax_rate: source.tax_rate,
				service_address_line_1: source.service_address_line_1,
				service_address_line_2: source.service_address_line_2,
				service_address_city: source.service_address_city,
				service_address_state: source.service_address_state,
				service_address_zip: source.service_address_zip,
				invoice_on_close: source.invoice_on_close
				// Deliberately NOT copied (defaults apply): scheduled_start/end, recurrence,
				// billing_type, invoice_frequency, fixed_invoice_amount, completed_at,
				// cancelled_at. The copy is a clean unscheduled job.
			})
			.returning();

		if (sourceLines.length > 0) {
			await tx.insert(jobLineItems).values(
				sourceLines.map((li, idx) => ({
					org_id: auth.orgId,
					job_id: row.id,
					// Omit line_key → fresh DB-default uuid: the copy owns its own line identity
					// and any future per-line media, independent of the source job.
					description: li.description,
					details: li.details,
					quantity: li.quantity,
					unit: li.unit,
					section_label: li.section_label,
					unit_price: li.unit_price,
					unit_cost: li.unit_cost,
					taxable: li.taxable,
					source_catalog_item_id: li.source_catalog_item_id,
					total: li.total,
					position: li.position ?? idx
				}))
			);
			await recalcJobTotals(tx, row.id);
		}

		return row;
	});

	return json({ job: { id: created.id } }, { status: 201 });
};
