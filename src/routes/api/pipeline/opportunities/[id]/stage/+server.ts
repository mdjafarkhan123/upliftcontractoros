import { json, error } from '@sveltejs/kit';
import { and, desc, eq, isNull } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import {
	contactAddresses,
	contacts,
	jobs,
	opportunities,
	outboxEvents,
	pipelineStages
} from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { moveStageSchema } from '$lib/server/pipeline/schemas';
import { canViewOpportunity } from '$lib/server/pipeline/permissions';

export const PATCH: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!auth.member.can_move_pipeline_stages) error(403, 'Forbidden');

	const id = event.params.id!;

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		error(400, 'Invalid JSON body');
	}

	const parsed = moveStageSchema.safeParse(body);
	if (!parsed.success) {
		return json(
			{ error: parsed.error.issues[0]?.message ?? 'Invalid input', code: 'VALIDATION_ERROR' },
			{ status: 422 }
		);
	}

	const { stage_id, from_stage_id, move_request_id, lost_reason } = parsed.data;

	const [opp] = await db
		.select()
		.from(opportunities)
		.where(
			and(
				eq(opportunities.id, id),
				eq(opportunities.org_id, auth.orgId),
				isNull(opportunities.deleted_at)
			)
		)
		.limit(1);
	if (!opp) error(404, 'Opportunity not found');
	if (!canViewOpportunity(auth.member, opp)) error(404, 'Opportunity not found');

	// Optimistic concurrency: client must know the true current stage.
	if (opp.stage_id !== from_stage_id) {
		return json(
			{
				error: 'This opportunity has already moved.',
				code: 'STAGE_CONFLICT',
				current_stage_id: opp.stage_id
			},
			{ status: 409 }
		);
	}

	const [stage] = await db
		.select()
		.from(pipelineStages)
		.where(
			and(
				eq(pipelineStages.id, stage_id),
				eq(pipelineStages.org_id, auth.orgId),
				isNull(pipelineStages.deleted_at)
			)
		)
		.limit(1);
	if (!stage) {
		return json({ error: 'Stage not found.', code: 'STAGE_NOT_FOUND' }, { status: 422 });
	}

	if (opp.stage_id === stage_id) {
		return json({ opportunity: opp, job: null });
	}

	const [fromStage] = await db
		.select({ name: pipelineStages.name })
		.from(pipelineStages)
		.where(eq(pipelineStages.id, opp.stage_id))
		.limit(1);
	const fromStageName = fromStage?.name ?? null;

	if (stage.is_lost && !lost_reason) {
		return json(
			{ error: 'A reason is required when marking lost.', code: 'LOST_REASON_REQUIRED' },
			{ status: 422 }
		);
	}

	// === Won transition: full Flow 2 ===
	if (stage.is_won) {
		try {
			const result = await db.transaction(async (tx) => {
				const now = new Date();

				const [updatedOpp] = await tx
					.update(opportunities)
					.set({ stage_id, closed_at: now, updated_at: now, stage_entered_at: now })
					.where(and(eq(opportunities.id, id), eq(opportunities.stage_id, from_stage_id)))
					.returning();
				if (!updatedOpp) return null;

				// Snapshot primary service address (fall back to any primary)
				const [primaryService] = await tx
					.select()
					.from(contactAddresses)
					.where(
						and(
							eq(contactAddresses.contact_id, updatedOpp.contact_id),
							eq(contactAddresses.label, 'service'),
							eq(contactAddresses.is_primary, true),
							isNull(contactAddresses.deleted_at)
						)
					)
					.limit(1);

				const [primaryAny] = primaryService
					? [primaryService]
					: await tx
							.select()
							.from(contactAddresses)
							.where(
								and(
									eq(contactAddresses.contact_id, updatedOpp.contact_id),
									eq(contactAddresses.is_primary, true),
									isNull(contactAddresses.deleted_at)
								)
							)
							.orderBy(desc(contactAddresses.created_at))
							.limit(1);

				const addr = primaryService ?? primaryAny ?? null;

				const [insertedJob] = await tx
					.insert(jobs)
					.values({
						org_id: auth.orgId,
						opportunity_id: updatedOpp.id,
						contact_id: updatedOpp.contact_id,
						title: updatedOpp.title,
						assigned_to: updatedOpp.assigned_to ?? null,
						service_address_line_1: addr?.address_line_1 ?? null,
						service_address_line_2: addr?.address_line_2 ?? null,
						service_address_city: addr?.city ?? null,
						service_address_state: addr?.state ?? null,
						service_address_zip: addr?.zip ?? null
					})
					.returning();

				await tx
					.update(contacts)
					.set({ status: 'customer', updated_at: now })
					.where(eq(contacts.id, updatedOpp.contact_id));

				await tx.insert(outboxEvents).values([
					{
						org_id: auth.orgId,
						event_type: 'opportunity.stage_changed',
						resource_type: 'opportunity',
						resource_id: updatedOpp.id,
						payload: {
							event_version: 1,
							opportunity_id: updatedOpp.id,
							org_id: auth.orgId,
							contact_id: updatedOpp.contact_id,
							assigned_to: updatedOpp.assigned_to ?? null,
							from_stage_id: opp.stage_id,
							to_stage_id: stage_id,
							from_stage_name: fromStageName,
							to_stage_name: stage.name
						},
						idempotency_key: `opportunity.stage_changed:${move_request_id}`
					},
					{
						org_id: auth.orgId,
						event_type: 'opportunity.won',
						resource_type: 'opportunity',
						resource_id: updatedOpp.id,
						payload: {
							event_version: 1,
							opportunity_id: updatedOpp.id,
							org_id: auth.orgId,
							contact_id: updatedOpp.contact_id,
							title: updatedOpp.title,
							assigned_to: updatedOpp.assigned_to ?? null,
							value: updatedOpp.value
						},
						idempotency_key: `opportunity.won:${updatedOpp.id}`
					},
					{
						org_id: auth.orgId,
						event_type: 'job.created',
						resource_type: 'job',
						resource_id: insertedJob.id,
						payload: {
							event_version: 1,
							job_id: insertedJob.id,
							org_id: auth.orgId,
							opportunity_id: insertedJob.opportunity_id,
							contact_id: insertedJob.contact_id,
							title: insertedJob.title,
							assigned_to: insertedJob.assigned_to
						},
						idempotency_key: `job.created:${insertedJob.id}`
					},
					{
						org_id: auth.orgId,
						event_type: 'contact.status_changed',
						resource_type: 'contact',
						resource_id: updatedOpp.contact_id,
						payload: {
							event_version: 1,
							contact_id: updatedOpp.contact_id,
							org_id: auth.orgId,
							new_status: 'customer',
							triggered_by_opportunity_id: updatedOpp.id
						},
						idempotency_key: `contact.status_changed:${updatedOpp.contact_id}:${updatedOpp.id}`
					}
				]);

				return { opportunity: updatedOpp, job: insertedJob };
			});

			if (!result) {
				const [fresh] = await db
					.select({ stage_id: opportunities.stage_id })
					.from(opportunities)
					.where(eq(opportunities.id, id))
					.limit(1);
				return json(
					{
						error: 'This opportunity has already moved.',
						code: 'STAGE_CONFLICT',
						current_stage_id: fresh?.stage_id ?? null
					},
					{ status: 409 }
				);
			}

			return json(result);
		} catch (e) {
			const msg = e instanceof Error ? e.message : '';
			// UNIQUE(opportunity_id) on jobs — duplicate Won attempt
			if (/unique|duplicate/i.test(msg)) {
				const [existingJob] = await db
					.select()
					.from(jobs)
					.where(eq(jobs.opportunity_id, id))
					.limit(1);
				const [updatedOpp] = await db
					.select()
					.from(opportunities)
					.where(eq(opportunities.id, id))
					.limit(1);
				return json({ opportunity: updatedOpp, job: existingJob ?? null });
			}
			throw e;
		}
	}

	// === Lost transition ===
	if (stage.is_lost) {
		const result = await db.transaction(async (tx) => {
			const now = new Date();
			const [updated] = await tx
				.update(opportunities)
				.set({
					stage_id,
					closed_at: now,
					lost_reason: lost_reason!,
					updated_at: now,
					stage_entered_at: now
				})
				.where(and(eq(opportunities.id, id), eq(opportunities.stage_id, from_stage_id)))
				.returning();
			if (!updated) return null;

			await tx.insert(outboxEvents).values([
				{
					org_id: auth.orgId,
					event_type: 'opportunity.stage_changed',
					resource_type: 'opportunity',
					resource_id: updated.id,
					payload: {
						event_version: 1,
						opportunity_id: updated.id,
						org_id: auth.orgId,
						contact_id: updated.contact_id,
						assigned_to: updated.assigned_to ?? null,
						from_stage_id: opp.stage_id,
						to_stage_id: stage_id,
						from_stage_name: fromStageName,
						to_stage_name: stage.name,
						changed_by_member_id: auth.member.id
					},
					idempotency_key: `opportunity.stage_changed:${move_request_id}`
				},
				{
					org_id: auth.orgId,
					event_type: 'opportunity.lost',
					resource_type: 'opportunity',
					resource_id: updated.id,
					payload: {
						event_version: 1,
						opportunity_id: updated.id,
						org_id: auth.orgId,
						contact_id: updated.contact_id,
						title: updated.title,
						assigned_to: updated.assigned_to ?? null,
						value: updated.value,
						lost_reason: updated.lost_reason
					},
					idempotency_key: `opportunity.lost:${updated.id}`
				}
			]);

			return updated;
		});

		if (!result) {
			const [fresh] = await db
				.select({ stage_id: opportunities.stage_id })
				.from(opportunities)
				.where(eq(opportunities.id, id))
				.limit(1);
			return json(
				{
					error: 'This opportunity has already moved.',
					code: 'STAGE_CONFLICT',
					current_stage_id: fresh?.stage_id ?? null
				},
				{ status: 409 }
			);
		}

		return json({ opportunity: result, job: null });
	}

	// === Standard stage move ===
	const result = await db.transaction(async (tx) => {
		const now = new Date();
		// Moving away from Won/Lost — clear closed_at and lost_reason
		const [updated] = await tx
			.update(opportunities)
			.set({
				stage_id,
				closed_at: null,
				lost_reason: null,
				updated_at: now,
				stage_entered_at: now
			})
			.where(and(eq(opportunities.id, id), eq(opportunities.stage_id, from_stage_id)))
			.returning();
		if (!updated) return null;

		await tx.insert(outboxEvents).values({
			org_id: auth.orgId,
			event_type: 'opportunity.stage_changed',
			resource_type: 'opportunity',
			resource_id: updated.id,
			payload: {
				event_version: 1,
				opportunity_id: updated.id,
				org_id: auth.orgId,
				contact_id: updated.contact_id,
				assigned_to: updated.assigned_to ?? null,
				from_stage_id: opp.stage_id,
				to_stage_id: stage_id,
				from_stage_name: fromStageName,
				to_stage_name: stage.name
			},
			idempotency_key: `opportunity.stage_changed:${move_request_id}`
		});

		return updated;
	});

	if (!result) {
		const [fresh] = await db
			.select({ stage_id: opportunities.stage_id })
			.from(opportunities)
			.where(eq(opportunities.id, id))
			.limit(1);
		return json(
			{
				error: 'This opportunity has already moved.',
				code: 'STAGE_CONFLICT',
				current_stage_id: fresh?.stage_id ?? null
			},
			{ status: 409 }
		);
	}

	return json({ opportunity: result, job: null });
};
