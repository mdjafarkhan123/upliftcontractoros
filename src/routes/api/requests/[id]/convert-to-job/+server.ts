import { json, error } from '@sveltejs/kit';
import { and, asc, eq, isNull } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import {
	jobLineItems,
	jobs,
	outboxEvents,
	requestLineItems,
	requests
} from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canManageRequests } from '$lib/server/requests/permissions';
import { recalcJobTotals } from '$lib/server/jobs/recalc';
import { loadRequestDetail } from '$lib/server/requests/detail';

// Convert a Request into a Job (Jobber "Convert to Job"). Snapshot-copies the
// request's line items into a new UNSCHEDULED one-off job (the contractor
// schedules its visit on the job page), then STAMPS THE REQUEST CONVERTED
// FOREVER (terminal, Jobber rule). One transaction — never half-converted.
export const POST: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	// Job creation is gated on can_view_full_pipeline (mirrors POST /api/jobs), which is
	// exactly what canManageRequests already checks.
	if (!canManageRequests(auth.member)) error(403, 'Forbidden');

	const requestId = event.params.id;

	const result = await db.transaction(async (tx) => {
		const [req] = await tx
			.select({
				id: requests.id,
				contact_id: requests.contact_id,
				title: requests.title,
				notes: requests.notes,
				converted_to_quote_id: requests.converted_to_quote_id,
				converted_to_job_id: requests.converted_to_job_id
			})
			.from(requests)
			.where(
				and(eq(requests.id, requestId), eq(requests.org_id, auth.orgId), isNull(requests.deleted_at))
			)
			.for('update')
			.limit(1);
		if (!req) throw error(404, 'Request not found');

		if (req.converted_to_job_id) {
			return { existing: true, id: req.converted_to_job_id };
		}
		if (req.converted_to_quote_id) {
			throw error(409, 'This request was already converted to a quote.');
		}

		const sourceLines = await tx
			.select()
			.from(requestLineItems)
			.where(
				and(
					eq(requestLineItems.request_id, requestId),
					eq(requestLineItems.org_id, auth.orgId),
					isNull(requestLineItems.deleted_at)
				)
			)
			.orderBy(asc(requestLineItems.position), asc(requestLineItems.created_at));

		const [inserted] = await tx
			.insert(jobs)
			.values({
				org_id: auth.orgId,
				source: 'manual',
				contact_id: req.contact_id,
				// Provenance back-link → the request detail drawer on the job page.
				request_id: req.id,
				title: req.title,
				// New jobs are 'scheduled' (renders "Pending" until a date lands), unscheduled,
				// one-off. The contractor gives it a visit/date on the job page.
				status: 'scheduled',
				job_type: 'one_off',
				notes: req.notes
			})
			.returning({ id: jobs.id });

		if (sourceLines.length > 0) {
			await tx.insert(jobLineItems).values(
				sourceLines.map((li) => ({
					org_id: auth.orgId,
					job_id: inserted.id,
					line_key: li.line_key,
					description: li.description,
					details: li.details,
					quantity: li.quantity,
					unit: li.unit,
					unit_price: li.unit_price,
					unit_cost: li.unit_cost,
					taxable: li.taxable,
					source_catalog_item_id: li.source_catalog_item_id,
					total: li.total,
					position: li.position
				}))
			);
			await recalcJobTotals(tx, inserted.id);
		}

		const now = new Date();
		await tx
			.update(requests)
			.set({ converted_to_job_id: inserted.id, converted_at: now, updated_at: now })
			.where(eq(requests.id, req.id));

		await tx.insert(outboxEvents).values({
			org_id: auth.orgId,
			event_type: 'request.converted',
			resource_type: 'request',
			resource_id: req.id,
			payload: {
				request_id: req.id,
				org_id: auth.orgId,
				contact_id: req.contact_id,
				converted_to: 'job',
				job_id: inserted.id
			},
			// Unique per conversion (not per request): a request can be re-converted after its
			// job is deleted (un-convert-on-delete), so keying on req.id alone collided with the
			// first conversion's outbox row. The fresh job id makes each conversion distinct.
			idempotency_key: `request.converted:${req.id}:job:${inserted.id}`
		});

		return { existing: false, id: inserted.id };
	});

	const detail = await loadRequestDetail(
		auth.orgId,
		requestId,
		auth.org.timezone || 'America/Chicago'
	);

	return json(
		{ data: { id: result.id, already_existed: result.existing, request: detail } },
		{ status: result.existing ? 200 : 201 }
	);
};
