import { json, error } from '@sveltejs/kit';
import { and, asc, desc, eq, gt, inArray, isNull, ne, sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import {
	appointments,
	appointmentAssignees,
	contacts,
	invoices,
	jobs,
	jobExpenses,
	jobLineItems,
	jobPaymentMilestones,
	orgMembers,
	outboxEvents,
	reviewRequests
} from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canEditJob, canViewJob } from '$lib/server/jobs/permissions';
import { canViewCostMargin } from '$lib/server/finance/permissions';
import { updateJobLineItemsSchema } from '$lib/server/jobs/schemas';
import { computeLineTotal, recalcJobTotals } from '$lib/server/jobs/recalc';
import { expandRecurrence } from '$lib/server/jobs/recurrence';
import { loadTimeEntriesAndCosting } from '$lib/server/jobs/timeEntryResponse';
import { loadJobTasks } from '$lib/server/jobs/taskResponse';
import { loadJobFormSubmissions } from '$lib/server/jobs/formSubmissionResponse';
import { loadJobSignoff } from '$lib/server/jobs/signoffResponse';
import { loadJobCustomFields } from '$lib/server/jobs/customFieldsResponse';
import type { JobExpenseCategory } from '$lib/types/jobs';

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
			recurrence: jobs.recurrence,
			invoice_on_close: jobs.invoice_on_close,
			billing_type: jobs.billing_type,
			invoice_frequency: jobs.invoice_frequency,
			fixed_invoice_amount: jobs.fixed_invoice_amount,
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

	// Cost is private: computed once here (no DB call) so the parallel loaders below can honour it.
	const canCost = canViewCostMargin(auth.member);

	// PERFORMANCE: every read below is INDEPENDENT — only the job row + permission check above gate
	// them, and none depends on another's result. So fire them CONCURRENTLY (one wave) instead of
	// awaiting in a waterfall (~a dozen stacked round-trips = the 3–6s load this endpoint used to
	// have). Query bodies are unchanged; only the awaiting is. Cost-gating (`canCost`) is preserved
	// exactly — see the empty-expenses fallback and the safeLineItems strip below.
	const [
		invoiceCountRows,
		activeInvoiceRows,
		lineItems,
		paymentMilestones,
		appointmentCountRows,
		reviewRows,
		expenses,
		timeAndCosting,
		tasks,
		form_submissions,
		signoff,
		custom_fields
	] = await Promise.all([
		db
			.select({ c: sql<number>`count(*)::int` })
			.from(invoices)
			.where(
				and(eq(invoices.job_id, id), eq(invoices.org_id, auth.orgId), isNull(invoices.deleted_at))
			),

		// An active (non-cancelled) invoice blocks creating another from the job — drives the
		// "Create invoice" vs "View invoice" affordance on the detail page.
		db
			.select({ c: sql<number>`count(*)::int` })
			.from(invoices)
			.where(
				and(
					eq(invoices.job_id, id),
					eq(invoices.org_id, auth.orgId),
					isNull(invoices.deleted_at),
					ne(invoices.status, 'cancelled')
				)
			),

		db
			.select({
				line_key: jobLineItems.line_key,
				description: jobLineItems.description,
				details: jobLineItems.details,
				quantity: jobLineItems.quantity,
				unit: jobLineItems.unit,
				section_label: jobLineItems.section_label,
				unit_price: jobLineItems.unit_price,
				unit_cost: jobLineItems.unit_cost,
				taxable: jobLineItems.taxable,
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
			.orderBy(asc(jobLineItems.position)),

		// Payment schedule (one-off billing). Each milestone is joined to its linked invoice so
		// the client can derive the per-row status (Upcoming / Draft / Awaiting payment / Paid)
		// and balance without a second round-trip. Percent rows carry no stored dollar amount.
		db
			.select({
				id: jobPaymentMilestones.id,
				key: jobPaymentMilestones.key,
				position: jobPaymentMilestones.position,
				description: jobPaymentMilestones.description,
				amount_type: jobPaymentMilestones.amount_type,
				amount_value: jobPaymentMilestones.amount_value,
				due_date: jobPaymentMilestones.due_date,
				invoice_id: jobPaymentMilestones.invoice_id,
				invoice_number: invoices.invoice_number,
				invoice_status: invoices.status,
				invoice_total: invoices.total,
				invoice_amount_paid: invoices.amount_paid
			})
			.from(jobPaymentMilestones)
			.leftJoin(invoices, eq(invoices.id, jobPaymentMilestones.invoice_id))
			.where(
				and(
					eq(jobPaymentMilestones.job_id, id),
					eq(jobPaymentMilestones.org_id, auth.orgId),
					isNull(jobPaymentMilestones.deleted_at)
				)
			)
			.orderBy(asc(jobPaymentMilestones.position)),

		db
			.select({ c: sql<number>`count(*)::int` })
			.from(appointments)
			.where(
				and(
					eq(appointments.job_id, id),
					eq(appointments.org_id, auth.orgId),
					isNull(appointments.deleted_at)
				)
			),

		db
			.select({ status: reviewRequests.status })
			.from(reviewRequests)
			.where(
				and(
					eq(reviewRequests.job_id, id),
					eq(reviewRequests.org_id, auth.orgId),
					isNull(reviewRequests.deleted_at)
				)
			)
			.limit(1),

		// Job costing (Session 1) is private: expenses + the computed profitability only reach the
		// browser for members who can see revenue. Everyone else gets an empty list (the costing
		// panel then doesn't render). Same cost-gating as before — just resolved to [] up front so
		// it can sit in the parallel batch.
		canCost
			? db
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
							eq(jobExpenses.job_id, id),
							eq(jobExpenses.org_id, auth.orgId),
							isNull(jobExpenses.deleted_at)
						)
					)
					.orderBy(desc(jobExpenses.expense_date), desc(jobExpenses.created_at))
			: Promise.resolve(
					[] as {
						id: string;
						category: JobExpenseCategory;
						description: string;
						amount: string;
						expense_date: string;
						notes: string | null;
						created_by_name: string | null;
						created_at: Date;
					}[]
				),

		// Time tracking (Session 2): hours are operational; the loader strips the $ side when !canCost.
		loadTimeEntriesAndCosting(auth.orgId, id, canCost),
		// Tasks / checklist (Session 3): operational, always returned to anyone who can view the job.
		loadJobTasks(auth.orgId, id),
		// Job forms (Session 4.2): operational, always returned to anyone who can view the job.
		loadJobFormSubmissions(auth.orgId, id),
		// Client sign-off (Session 6): operational, always returned to anyone who can view the job.
		loadJobSignoff(auth.orgId, id),
		// Custom fields (Session 7): every org-defined field merged with this job's value.
		loadJobCustomFields(auth.orgId, id)
	]);

	// Cost is private: blank it for members without revenue access before it leaves the server.
	const safeLineItems = canCost ? lineItems : lineItems.map((li) => ({ ...li, unit_cost: null }));
	const { time_entries, costing } = timeAndCosting;

	return json({
		job: {
			...row,
			tags: row.tags ?? [],
			line_items: safeLineItems,
			payment_milestones: paymentMilestones,
			invoice_count: invoiceCountRows[0]?.c ?? 0,
			has_active_invoice: (activeInvoiceRows[0]?.c ?? 0) > 0,
			appointment_count: appointmentCountRows[0]?.c ?? 0,
			review_request_status: reviewRows[0]?.status ?? null,
			expenses,
			costing,
			time_entries,
			tasks,
			form_submissions,
			signoff,
			custom_fields
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
			status: jobs.status,
			contact_id: jobs.contact_id,
			contact_name: contacts.full_name,
			title: jobs.title,
			scheduled_start: jobs.scheduled_start,
			scheduled_end: jobs.scheduled_end,
			recurrence: jobs.recurrence,
			service_address_line_1: jobs.service_address_line_1,
			service_address_line_2: jobs.service_address_line_2,
			service_address_city: jobs.service_address_city,
			service_address_state: jobs.service_address_state,
			service_address_zip: jobs.service_address_zip
		})
		.from(jobs)
		.innerJoin(contacts, eq(contacts.id, jobs.contact_id))
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
	// Persist the new repeat rule (a rule object, or null to revert to one-off). The visit
	// rebuild that mirrors this onto the calendar happens inside the transaction below.
	if (input.recurrence !== undefined) updates.recurrence = input.recurrence;
	if (input.notes !== undefined) updates.notes = input.notes;
	if (input.scope_of_work !== undefined) updates.scope_of_work = input.scope_of_work;
	if (input.invoice_on_close !== undefined) updates.invoice_on_close = input.invoice_on_close;
	if (input.billing_type !== undefined) updates.billing_type = input.billing_type;
	if (input.invoice_frequency !== undefined) updates.invoice_frequency = input.invoice_frequency;
	if (input.fixed_invoice_amount !== undefined)
		updates.fixed_invoice_amount =
			input.fixed_invoice_amount == null ? null : String(input.fixed_invoice_amount);
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
			// Cost preservation: an editor without revenue access sends no unit_cost (the
			// column is hidden from them). Snapshot the current cost per line_key BEFORE the
			// wipe and carry it forward so their save never blanks the owner's private costs.
			const canEditCost = canViewCostMargin(auth.member);
			const priorCostByKey = new Map<string, string | null>();
			if (!canEditCost) {
				const priorRows = await tx
					.select({ line_key: jobLineItems.line_key, unit_cost: jobLineItems.unit_cost })
					.from(jobLineItems)
					.where(and(eq(jobLineItems.job_id, id), isNull(jobLineItems.deleted_at)));
				for (const p of priorRows) priorCostByKey.set(p.line_key, p.unit_cost);
			}

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
						unit_cost: canEditCost
							? li.unit_cost != null
								? String(li.unit_cost)
								: null
							: ((li.line_key ? priorCostByKey.get(li.line_key) : null) ?? null),
						// Omitted → true (DB default); mirrors the quote/invoice per-line tax flag.
						taxable: li.taxable ?? true,
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

		// Payment schedule: wipe-and-reinsert, but milestones already turned into invoices
		// are LOCKED — never deleted or duplicated. We preserve them and re-insert only the
		// not-yet-invoiced rows from the payload (skipping any whose key matches a locked row).
		if (input.payment_milestones !== undefined) {
			const lockedRows = await tx
				.select({ key: jobPaymentMilestones.key })
				.from(jobPaymentMilestones)
				.where(
					and(
						eq(jobPaymentMilestones.job_id, id),
						isNull(jobPaymentMilestones.deleted_at),
						sql`${jobPaymentMilestones.invoice_id} IS NOT NULL`
					)
				);
			const lockedKeys = new Set(lockedRows.map((r) => r.key));

			await tx
				.update(jobPaymentMilestones)
				.set({ deleted_at: new Date(), updated_at: new Date() })
				.where(
					and(
						eq(jobPaymentMilestones.job_id, id),
						isNull(jobPaymentMilestones.deleted_at),
						isNull(jobPaymentMilestones.invoice_id)
					)
				);

			const toInsert = input.payment_milestones.filter((m) => !(m.key && lockedKeys.has(m.key)));
			if (toInsert.length > 0) {
				await tx.insert(jobPaymentMilestones).values(
					toInsert.map((m, idx) => ({
						org_id: auth.orgId,
						job_id: id,
						key: m.key ?? undefined,
						position: idx,
						description: m.description,
						amount_type: m.amount_type,
						amount_value: String(m.amount_value),
						due_date: m.due_date ?? null
					}))
				);
			}
		}

		// Recurrence edit: keep the calendar in sync with the new rule. The past is frozen,
		// the future is rebuilt (Jobber / Housecall Pro behavior). We only act when the client
		// explicitly sends `recurrence` (a rule object to (re)build, or null to go one-off).
		if (input.recurrence !== undefined) {
			const now = new Date();
			const newRule = input.recurrence; // JobRecurrence | null

			// 1. Clear the FUTURE regenerable visits only. Frozen (never touched): visits that
			//    already started (scheduled_start <= now), aren't still 'scheduled'
			//    (completed/cancelled/no_show), or have been invoiced (billed_invoice_id set —
			//    deleting that row would orphan the invoice's billing anchor).
			const futureVisits = await tx
				.select({ id: appointments.id })
				.from(appointments)
				.where(
					and(
						eq(appointments.job_id, id),
						eq(appointments.org_id, auth.orgId),
						isNull(appointments.deleted_at),
						eq(appointments.status, 'scheduled'),
						isNull(appointments.billed_invoice_id),
						gt(appointments.scheduled_start, now)
					)
				);
			const futureIds = futureVisits.map((v) => v.id);
			if (futureIds.length > 0) {
				await tx
					.delete(appointmentAssignees)
					.where(
						and(
							eq(appointmentAssignees.org_id, auth.orgId),
							inArray(appointmentAssignees.appointment_id, futureIds)
						)
					);
				await tx
					.update(appointments)
					.set({ deleted_at: now, updated_at: now })
					.where(inArray(appointments.id, futureIds));
			}

			// 2. Rebuild the upcoming visits from the new rule (only when still recurring).
			if (newRule) {
				// Anchor for expansion: the new start (if the edit moved it) else the current
				// series start. The schema guarantees a start accompanies a rule.
				const anchorStart =
					(updates.scheduled_start as Date | null | undefined) ?? existing.scheduled_start;
				const anchorEnd =
					(updates.scheduled_end as Date | null | undefined) ?? existing.scheduled_end ?? null;
				if (anchorStart) {
					const visitLocation =
						[
							existing.service_address_line_1,
							existing.service_address_line_2,
							[
								existing.service_address_city,
								existing.service_address_state,
								existing.service_address_zip
							]
								.filter(Boolean)
								.join(', ')
						]
							.filter(Boolean)
							.join(' · ') || null;

					const expanded = expandRecurrence(anchorStart, anchorEnd, newRule);

					// Don't double-book a timeslot that a frozen visit already occupies.
					const survivors = await tx
						.select({ start: appointments.scheduled_start })
						.from(appointments)
						.where(
							and(
								eq(appointments.job_id, id),
								eq(appointments.org_id, auth.orgId),
								isNull(appointments.deleted_at)
							)
						);
					// Only dated survivors matter for de-duping against the newly expanded visits;
					// an unscheduled visit (null start) can't collide with a concrete date.
					const survivorStarts = new Set(
						survivors.filter((s) => s.start !== null).map((s) => s.start!.getTime())
					);

					const toInsert = expanded.filter(
						(v) => v.start.getTime() > now.getTime() && !survivorStarts.has(v.start.getTime())
					);

					// Use the new assignee if the same PATCH reassigned the job, else the current one.
					const assignee =
						input.assigned_to !== undefined ? input.assigned_to : existing.assigned_to;

					if (toInsert.length > 0) {
						const inserted = await tx
							.insert(appointments)
							.values(
								toInsert.map((v) => ({
									org_id: auth.orgId,
									contact_id: existing.contact_id,
									job_id: id,
									assigned_to: assignee ?? null,
									type: 'job_start' as const,
									status: 'scheduled' as const,
									// Match the create path: each visit is "{Client} - {Job}", not the bare job title.
									title: `${existing.contact_name} - ${existing.title}`,
									scheduled_start: v.start,
									scheduled_end: v.end,
									location: visitLocation,
									notes: input.visit_instructions ?? null
								}))
							)
							.returning({
								id: appointments.id,
								scheduled_start: appointments.scheduled_start,
								scheduled_end: appointments.scheduled_end
							});

						if (assignee) {
							await tx.insert(appointmentAssignees).values(
								inserted.map((a) => ({
									appointment_id: a.id,
									member_id: assignee,
									org_id: auth.orgId,
									is_lead: true
								}))
							);
						}

						// Enroll each newly built visit in the appointment-reminder engine
						// (Session B): one `appointment.created` per visit so reminders anchor
						// to that visit's own scheduled_start. Visits removed by this rebuild
						// need no stop event — the engine's fire-time guard skips deleted ones.
						const assigneeIds = assignee ? [assignee] : [];
						await tx.insert(outboxEvents).values(
							inserted.map((a) => ({
								org_id: auth.orgId,
								event_type: 'appointment.created' as const,
								resource_type: 'appointment',
								resource_id: a.id,
								payload: {
									appointment_id: a.id,
									org_id: auth.orgId,
									contact_id: existing.contact_id,
									job_id: id,
									assigned_to: assignee ?? null,
									assignee_ids: assigneeIds,
									// Non-null: freshly expanded recurring visits always carry a date.
									scheduled_start: a.scheduled_start!.toISOString(),
									scheduled_end: a.scheduled_end?.toISOString() ?? null
								},
								idempotency_key: `appointment.created:${a.id}`
							}))
						);
					}
				}

				// 3. Re-pin the job's scheduled_start/end to the earliest remaining visit so the
				//    Today / Unscheduled list scopes stay accurate. (One-off edits — newRule null —
				//    keep whatever scheduled_start the normal `updates` set from the payload.)
				const [earliest] = await tx
					.select({
						start: appointments.scheduled_start,
						end: appointments.scheduled_end
					})
					.from(appointments)
					.where(
						and(
							eq(appointments.job_id, id),
							eq(appointments.org_id, auth.orgId),
							isNull(appointments.deleted_at)
						)
					)
					.orderBy(asc(appointments.scheduled_start))
					.limit(1);
				if (earliest) {
					await tx
						.update(jobs)
						.set({ scheduled_start: earliest.start, scheduled_end: earliest.end, updated_at: now })
						.where(eq(jobs.id, id));
				}
			}
		}

		// One-off visit sync: a one-off job's single calendar visit must track the job's
		// schedule (Jobber / Housecall Pro — the job IS the visit). Recurring jobs are
		// handled by the rebuild block above. We act when the schedule was touched and
		// the job is (now) one-off — covering reschedule, add-a-date, clear-to-Anytime,
		// and a recurring→one-off flip (the rule block above already cleared its visits).
		const finalIsRecurring =
			input.recurrence !== undefined ? input.recurrence !== null : existing.recurrence != null;
		if (
			!finalIsRecurring &&
			(input.scheduled_start !== undefined || input.recurrence !== undefined)
		) {
			const now = new Date();
			const finalStart =
				(updates.scheduled_start as Date | null | undefined) !== undefined
					? (updates.scheduled_start as Date | null)
					: existing.scheduled_start;
			const finalEnd =
				(updates.scheduled_end as Date | null | undefined) !== undefined
					? (updates.scheduled_end as Date | null)
					: existing.scheduled_end;

			const visitLocation =
				[
					existing.service_address_line_1,
					existing.service_address_line_2,
					[
						existing.service_address_city,
						existing.service_address_state,
						existing.service_address_zip
					]
						.filter(Boolean)
						.join(', ')
				]
					.filter(Boolean)
					.join(' · ') || null;

			// The managed visit: this job's live (scheduled OR still-unscheduled, unbilled)
			// one-off visit. Including 'unscheduled' lets a "Schedule later" placeholder be
			// ADOPTED (dated + promoted below) instead of leaving it orphaned while a duplicate
			// scheduled visit gets created. Past completed / invoiced visits are never touched.
			const [visit] = await tx
				.select({
					id: appointments.id,
					scheduled_start: appointments.scheduled_start,
					scheduled_end: appointments.scheduled_end
				})
				.from(appointments)
				.where(
					and(
						eq(appointments.job_id, id),
						eq(appointments.org_id, auth.orgId),
						isNull(appointments.deleted_at),
						inArray(appointments.status, ['scheduled', 'unscheduled']),
						isNull(appointments.billed_invoice_id)
					)
				)
				// Prefer an already-dated visit over a placeholder if somehow both exist
				// (NULLS LAST on asc keeps the unscheduled one at the back).
				.orderBy(asc(appointments.scheduled_start))
				.limit(1);

			const assignee = input.assigned_to !== undefined ? input.assigned_to : existing.assigned_to;

			if (!finalStart) {
				// Job cleared to "Anytime" → remove its calendar visit.
				if (visit) {
					await tx
						.delete(appointmentAssignees)
						.where(
							and(
								eq(appointmentAssignees.org_id, auth.orgId),
								eq(appointmentAssignees.appointment_id, visit.id)
							)
						);
					await tx
						.update(appointments)
						.set({ deleted_at: now, updated_at: now })
						.where(eq(appointments.id, visit.id));
				}
			} else if (visit) {
				// Reschedule the existing visit in place. Reset reminder flags when the
				// time moved so the reminder worker re-arms for the new slot.
				const moved =
					// A previously unscheduled placeholder (null start) gaining a date counts as a move.
					visit.scheduled_start === null ||
					visit.scheduled_start.getTime() !== finalStart.getTime() ||
					(visit.scheduled_end?.getTime() ?? null) !== (finalEnd?.getTime() ?? null);

				const visitUpdates: Record<string, unknown> = {
					// finalStart is non-null in this branch, so an adopted "Schedule later"
					// placeholder is promoted from 'unscheduled' → 'scheduled' (no-op if already scheduled).
					status: 'scheduled' as const,
					scheduled_start: finalStart,
					scheduled_end: finalEnd,
					updated_at: now
				};
				if (assigneeChanged) visitUpdates.assigned_to = assignee ?? null;
				if (moved) {
					visitUpdates.reminder_24h_sent = false;
					visitUpdates.reminder_1h_sent = false;
				}
				await tx.update(appointments).set(visitUpdates).where(eq(appointments.id, visit.id));

				if (assigneeChanged) {
					await tx
						.delete(appointmentAssignees)
						.where(
							and(
								eq(appointmentAssignees.org_id, auth.orgId),
								eq(appointmentAssignees.appointment_id, visit.id)
							)
						);
					if (assignee) {
						await tx.insert(appointmentAssignees).values({
							appointment_id: visit.id,
							member_id: assignee,
							org_id: auth.orgId,
							is_lead: true
						});
					}
				}

				if (moved) {
					await tx.insert(outboxEvents).values({
						org_id: auth.orgId,
						event_type: 'appointment.rescheduled',
						resource_type: 'appointment',
						resource_id: visit.id,
						payload: {
							appointment_id: visit.id,
							org_id: auth.orgId,
							contact_id: existing.contact_id,
							job_id: id,
							assigned_to: assignee ?? null,
							assignee_ids: assignee ? [assignee] : [],
							old_start_at: visit.scheduled_start?.toISOString() ?? null,
							new_start_at: finalStart.toISOString(),
							reminder_flags_reset: true
						},
						idempotency_key: `appointment.rescheduled:${visit.id}:${finalStart.toISOString()}:${finalEnd?.toISOString() ?? 'none'}:${now.getTime()}`
					});
				}
			} else {
				// No live visit yet (date added to a previously unscheduled job, or a
				// recurring→one-off flip) → create the single visit.
				const [created] = await tx
					.insert(appointments)
					.values({
						org_id: auth.orgId,
						contact_id: existing.contact_id,
						job_id: id,
						assigned_to: assignee ?? null,
						type: 'job_start' as const,
						status: 'scheduled' as const,
						title: existing.title,
						scheduled_start: finalStart,
						scheduled_end: finalEnd,
						location: visitLocation,
						notes: input.visit_instructions ?? null
					})
					.returning({
						id: appointments.id,
						scheduled_start: appointments.scheduled_start,
						scheduled_end: appointments.scheduled_end
					});

				if (assignee) {
					await tx.insert(appointmentAssignees).values({
						appointment_id: created.id,
						member_id: assignee,
						org_id: auth.orgId,
						is_lead: true
					});
				}

				await tx.insert(outboxEvents).values({
					org_id: auth.orgId,
					event_type: 'appointment.created' as const,
					resource_type: 'appointment',
					resource_id: created.id,
					payload: {
						appointment_id: created.id,
						org_id: auth.orgId,
						contact_id: existing.contact_id,
						job_id: id,
						assigned_to: assignee ?? null,
						assignee_ids: assignee ? [assignee] : [],
						// Non-null: this branch inserts the visit with finalStart (a real date).
						scheduled_start: created.scheduled_start!.toISOString(),
						scheduled_end: created.scheduled_end?.toISOString() ?? null
					},
					idempotency_key: `appointment.created:${created.id}`
				});
			}
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

		// Reschedule confirmation to the client. The client only sends notify_channel
		// when the start actually moved; the time-stamped idempotency key makes each
		// distinct new time its own event (and dedupes a repeated save of the same time).
		if (input.notify_channel && input.notify_channel !== 'none' && fresh.scheduled_start) {
			await tx.insert(outboxEvents).values({
				org_id: auth.orgId,
				event_type: 'job.scheduled',
				resource_type: 'job',
				resource_id: id,
				payload: {
					job_id: id,
					org_id: auth.orgId,
					contact_id: fresh.contact_id,
					channel: input.notify_channel,
					scheduled_start: fresh.scheduled_start
				},
				idempotency_key: `job.scheduled:${id}:${fresh.scheduled_start.getTime()}`
			});
		}

		// Strip cost from the echoed line items when the editor can't view it, matching GET.
		const safeLines = canViewCostMargin(auth.member)
			? lineItems
			: lineItems.map((li) => ({ ...li, unit_cost: null }));
		return { ...fresh, line_items: safeLines };
	});

	return json({ job: result });
};

// Soft-delete a job → it disappears from every list (status counts, table) and its
// visits leave the calendar. We only stamp `deleted_at` (the contacts recycle-bin
// model), so the row is recoverable later rather than physically removed. Destructive,
// so it is gated to managers (full-pipeline access) — the same bar as cancelling a job.
export const DELETE: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!auth.member.can_view_full_pipeline) error(403, 'Forbidden');

	const id = event.params.id!;

	const [existing] = await db
		.select({ id: jobs.id })
		.from(jobs)
		.where(and(eq(jobs.id, id), eq(jobs.org_id, auth.orgId), isNull(jobs.deleted_at)))
		.limit(1);
	if (!existing) error(404, 'Job not found');

	const now = new Date();
	await db.transaction(async (tx) => {
		await tx
			.update(jobs)
			.set({ deleted_at: now, updated_at: now })
			.where(and(eq(jobs.id, id), eq(jobs.org_id, auth.orgId)));
		// Pull this job's own visits off the calendar alongside it. Only its still-active
		// visits — already-deleted ones stay as they are.
		await tx
			.update(appointments)
			.set({ deleted_at: now })
			.where(
				and(
					eq(appointments.job_id, id),
					eq(appointments.org_id, auth.orgId),
					isNull(appointments.deleted_at)
				)
			);
	});

	return new Response(null, { status: 204 });
};
