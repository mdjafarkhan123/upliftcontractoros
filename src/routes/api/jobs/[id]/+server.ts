import { json, error } from '@sveltejs/kit';
import { and, asc, eq, isNull, ne, sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import {
	appointments,
	contacts,
	invoices,
	jobs,
	jobLineItems,
	orgMembers,
	outboxEvents,
	reviewRequests
} from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canEditJob, canViewJob } from '$lib/server/jobs/permissions';
import { updateJobLineItemsSchema } from '$lib/server/jobs/schemas';
import { computeLineTotal, recalcJobTotals } from '$lib/server/jobs/recalc';

export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);

	const id = event.params.id!;
	const [row] = await db
		.select({
			id: jobs.id,
			title: jobs.title,
			status: jobs.status,
			contact_id: jobs.contact_id,
			contact_name: contacts.full_name,
			contact_phone: contacts.phone,
			contact_email: contacts.email,
			opportunity_id: jobs.opportunity_id,
			source: jobs.source,
			assigned_to: jobs.assigned_to,
			assignee_name: orgMembers.full_name,
			job_type: jobs.job_type,
			tags: jobs.tags,
			notes: jobs.notes,
			scope_of_work: jobs.scope_of_work,
			subtotal: jobs.subtotal,
			discount_type: jobs.discount_type,
			discount_value: jobs.discount_value,
			discount_amount: jobs.discount_amount,
			discount_label: jobs.discount_label,
			tax_rate: jobs.tax_rate,
			tax_amount: jobs.tax_amount,
			total: jobs.total,
			service_address_line_1: jobs.service_address_line_1,
			service_address_line_2: jobs.service_address_line_2,
			service_address_city: jobs.service_address_city,
			service_address_state: jobs.service_address_state,
			service_address_zip: jobs.service_address_zip,
			scheduled_start: jobs.scheduled_start,
			scheduled_end: jobs.scheduled_end,
			completed_at: jobs.completed_at,
			cancelled_at: jobs.cancelled_at,
			created_at: jobs.created_at,
			updated_at: jobs.updated_at
		})
		.from(jobs)
		.innerJoin(contacts, eq(contacts.id, jobs.contact_id))
		.leftJoin(orgMembers, eq(orgMembers.id, jobs.assigned_to))
		.where(and(eq(jobs.id, id), eq(jobs.org_id, auth.orgId), isNull(jobs.deleted_at)))
		.limit(1);

	if (!row) error(404, 'Job not found');
	if (!canViewJob(auth.member, { assigned_to: row.assigned_to })) {
		error(403, 'Forbidden');
	}

	const [invoiceCountRow] = await db
		.select({ c: sql<number>`count(*)::int` })
		.from(invoices)
		.where(
			and(eq(invoices.job_id, id), eq(invoices.org_id, auth.orgId), isNull(invoices.deleted_at))
		);

	// An active (non-cancelled) invoice blocks creating another from the job — drives the
	// "Create invoice" vs "View invoice" affordance on the detail page.
	const [activeInvoiceRow] = await db
		.select({ c: sql<number>`count(*)::int` })
		.from(invoices)
		.where(
			and(
				eq(invoices.job_id, id),
				eq(invoices.org_id, auth.orgId),
				isNull(invoices.deleted_at),
				ne(invoices.status, 'cancelled')
			)
		);

	const lineItems = await db
		.select({
			line_key: jobLineItems.line_key,
			description: jobLineItems.description,
			details: jobLineItems.details,
			quantity: jobLineItems.quantity,
			unit: jobLineItems.unit,
			section_label: jobLineItems.section_label,
			unit_price: jobLineItems.unit_price,
			unit_cost: jobLineItems.unit_cost,
			source_catalog_item_id: jobLineItems.source_catalog_item_id,
			total: jobLineItems.total,
			position: jobLineItems.position
		})
		.from(jobLineItems)
		.where(
			and(
				eq(jobLineItems.job_id, id),
				eq(jobLineItems.org_id, auth.orgId),
				isNull(jobLineItems.deleted_at)
			)
		)
		.orderBy(asc(jobLineItems.position));

	const [appointmentCountRow] = await db
		.select({ c: sql<number>`count(*)::int` })
		.from(appointments)
		.where(
			and(
				eq(appointments.job_id, id),
				eq(appointments.org_id, auth.orgId),
				isNull(appointments.deleted_at)
			)
		);

	const [rr] = await db
		.select({ status: reviewRequests.status })
		.from(reviewRequests)
		.where(
			and(
				eq(reviewRequests.job_id, id),
				eq(reviewRequests.org_id, auth.orgId),
				isNull(reviewRequests.deleted_at)
			)
		)
		.limit(1);

	return json({
		job: {
			...row,
			tags: row.tags ?? [],
			line_items: lineItems,
			invoice_count: invoiceCountRow?.c ?? 0,
			has_active_invoice: (activeInvoiceRow?.c ?? 0) > 0,
			appointment_count: appointmentCountRow?.c ?? 0,
			review_request_status: rr?.status ?? null
		}
	});
};

export const PATCH: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);

	const id = event.params.id!;

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		error(400, 'Invalid JSON body');
	}

	const parsed = updateJobLineItemsSchema.safeParse(body);
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

	const [existing] = await db
		.select({
			id: jobs.id,
			assigned_to: jobs.assigned_to,
			status: jobs.status
		})
		.from(jobs)
		.where(and(eq(jobs.id, id), eq(jobs.org_id, auth.orgId), isNull(jobs.deleted_at)))
		.limit(1);
	if (!existing) error(404, 'Job not found');

	if (!canEditJob(auth.member, { assigned_to: existing.assigned_to })) {
		error(403, 'Forbidden');
	}

	if (existing.status === 'completed' || existing.status === 'cancelled') {
		return json({ error: 'Cannot edit a closed job.' }, { status: 422 });
	}

	if (input.assigned_to) {
		const [assignee] = await db
			.select({ id: orgMembers.id })
			.from(orgMembers)
			.where(
				and(
					eq(orgMembers.id, input.assigned_to),
					eq(orgMembers.org_id, auth.orgId),
					eq(orgMembers.is_active, true),
					isNull(orgMembers.deleted_at)
				)
			)
			.limit(1);
		if (!assignee) {
			return json({ error: 'Assignee is not an active member.' }, { status: 422 });
		}
	}

	const discountType = input.discount_type;

	const updates: Record<string, unknown> = { updated_at: new Date() };
	if (input.assigned_to !== undefined) updates.assigned_to = input.assigned_to;
	if (input.job_type !== undefined) updates.job_type = input.job_type ?? null;
	if (input.tags !== undefined) updates.tags = input.tags;
	if (input.scheduled_start !== undefined) updates.scheduled_start = input.scheduled_start;
	if (input.scheduled_end !== undefined) updates.scheduled_end = input.scheduled_end;
	if (input.notes !== undefined) updates.notes = input.notes;
	if (input.scope_of_work !== undefined) updates.scope_of_work = input.scope_of_work;
	if (input.tax_rate !== undefined) updates.tax_rate = String(input.tax_rate);
	if (discountType !== undefined) {
		updates.discount_type = discountType;
		// Clearing to 'none' wipes value/label; recalc then nulls discount_amount.
		if (discountType === 'none') {
			updates.discount_value = null;
			updates.discount_label = null;
		}
	}
	if (input.discount_value !== undefined)
		updates.discount_value = input.discount_value === null ? null : String(input.discount_value);
	if (input.discount_label !== undefined)
		updates.discount_label = input.discount_label?.trim() || null;

	const assigneeChanged =
		input.assigned_to !== undefined && input.assigned_to !== existing.assigned_to;

	const result = await db.transaction(async (tx) => {
		// Lock the job row to serialize against concurrent line edits before recalc.
		const [locked] = await tx.execute<{ status: string }>(sql`
			SELECT status FROM jobs
			WHERE id = ${id} AND org_id = ${auth.orgId} AND deleted_at IS NULL
			FOR UPDATE
		`);
		if (!locked) throw error(404, 'Job not found');
		if (locked.status === 'completed' || locked.status === 'cancelled') {
			throw error(422, 'Cannot edit a closed job.');
		}

		await tx.update(jobs).set(updates).where(eq(jobs.id, id));

		// Line items: wipe-and-reinsert keyed by line_key, then recalc the job totals — the
		// same snapshot/replace pattern the quote PATCH uses. Jobs stay independent of the
		// quote they were copied from. An empty array clears all lines (totals → 0).
		if (input.line_items !== undefined) {
			await tx
				.update(jobLineItems)
				.set({ deleted_at: new Date(), updated_at: new Date() })
				.where(and(eq(jobLineItems.job_id, id), isNull(jobLineItems.deleted_at)));
			if (input.line_items.length > 0) {
				await tx.insert(jobLineItems).values(
					input.line_items.map((li, idx) => ({
						org_id: auth.orgId,
						job_id: id,
						// undefined → DB default (fresh uuid); never pass null (column is NOT NULL).
						line_key: li.line_key ?? undefined,
						description: li.description,
						details: li.details?.trim() || null,
						quantity: String(li.quantity),
						unit: li.unit?.trim() || null,
						section_label: li.section_label?.trim() || null,
						unit_price: String(li.unit_price),
						unit_cost: li.unit_cost != null ? String(li.unit_cost) : null,
						source_catalog_item_id: li.source_catalog_item_id ?? null,
						total: computeLineTotal(li.quantity, li.unit_price),
						position: li.position ?? idx
					}))
				);
			}
			await recalcJobTotals(tx, id);
		} else if (input.tax_rate !== undefined || input.discount_type !== undefined) {
			// Pricing changed without touching line items — still recompute the
			// authoritative discount_amount/tax/total.
			await recalcJobTotals(tx, id);
		}

		if (assigneeChanged) {
			await tx.insert(outboxEvents).values({
				org_id: auth.orgId,
				event_type: 'job.assigned',
				resource_type: 'job',
				resource_id: id,
				payload: {
					job_id: id,
					org_id: auth.orgId,
					from_assigned_to: existing.assigned_to,
					to_assigned_to: input.assigned_to ?? null
				},
				idempotency_key: `job.assigned:${id}:${input.assigned_to ?? 'null'}`
			});
		}

		// Re-read the job AFTER recalc so the response carries the authoritative totals,
		// plus the current line items so the client store reflects the edit without a refetch.
		const [fresh] = await tx.select().from(jobs).where(eq(jobs.id, id)).limit(1);
		const lineItems = await tx
			.select({
				line_key: jobLineItems.line_key,
				description: jobLineItems.description,
				details: jobLineItems.details,
				quantity: jobLineItems.quantity,
				unit: jobLineItems.unit,
				section_label: jobLineItems.section_label,
				unit_price: jobLineItems.unit_price,
				unit_cost: jobLineItems.unit_cost,
				source_catalog_item_id: jobLineItems.source_catalog_item_id,
				total: jobLineItems.total,
				position: jobLineItems.position
			})
			.from(jobLineItems)
			.where(and(eq(jobLineItems.job_id, id), isNull(jobLineItems.deleted_at)))
			.orderBy(asc(jobLineItems.position));

		return { ...fresh, line_items: lineItems };
	});

	return json({ job: result });
};
