import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import {
	contactAddresses,
	contacts,
	jobs,
	opportunities,
	outboxEvents
} from '$lib/server/db/schema';

type Opportunity = typeof opportunities.$inferSelect;
type Job = typeof jobs.$inferSelect;
type PipelineLostReason = NonNullable<Opportunity['lost_reason']>;

/**
 * Marks an open opportunity as Won and runs the full Flow 2 side effects:
 * creates the linked job (snapshotting the contact's primary service address),
 * promotes the contact to a customer, and emits opportunity.won + job.created +
 * contact.status_changed onto the outbox — all inside one transaction.
 *
 * Idempotent: only an `open` deal transitions (conditional UPDATE). A concurrent
 * Won (e.g. quote acceptance racing a manual Mark-Won) is caught via the
 * UNIQUE(opportunity_id) index on jobs and resolved by returning the existing row.
 *
 * Returns null when the deal was already closed (no transition happened).
 *
 * Shared by the pipeline status route and the quote-accepted worker handler so
 * both paths produce identical effects.
 */
export async function markOpportunityWon(
	opp: Opportunity
): Promise<{ opportunity: Opportunity; job: Job | null } | null> {
	const orgId = opp.org_id;
	try {
		return await db.transaction(async (tx) => {
			const now = new Date();

			const [updatedOpp] = await tx
				.update(opportunities)
				.set({ status: 'won', closed_at: now, updated_at: now })
				.where(and(eq(opportunities.id, opp.id), eq(opportunities.status, 'open')))
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
					org_id: orgId,
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
					org_id: orgId,
					event_type: 'opportunity.won',
					resource_type: 'opportunity',
					resource_id: updatedOpp.id,
					payload: {
						event_version: 1,
						opportunity_id: updatedOpp.id,
						org_id: orgId,
						contact_id: updatedOpp.contact_id,
						title: updatedOpp.title,
						assigned_to: updatedOpp.assigned_to ?? null,
						value: updatedOpp.value
					},
					idempotency_key: `opportunity.won:${updatedOpp.id}`
				},
				{
					org_id: orgId,
					event_type: 'job.created',
					resource_type: 'job',
					resource_id: insertedJob.id,
					payload: {
						event_version: 1,
						job_id: insertedJob.id,
						org_id: orgId,
						opportunity_id: insertedJob.opportunity_id,
						contact_id: insertedJob.contact_id,
						title: insertedJob.title,
						assigned_to: insertedJob.assigned_to
					},
					idempotency_key: `job.created:${insertedJob.id}`
				},
				{
					org_id: orgId,
					event_type: 'contact.status_changed',
					resource_type: 'contact',
					resource_id: updatedOpp.contact_id,
					payload: {
						event_version: 1,
						contact_id: updatedOpp.contact_id,
						org_id: orgId,
						new_status: 'customer',
						triggered_by_opportunity_id: updatedOpp.id
					},
					idempotency_key: `contact.status_changed:${updatedOpp.contact_id}:${updatedOpp.id}`
				}
			]);

			return { opportunity: updatedOpp, job: insertedJob };
		});
	} catch (e) {
		const msg = e instanceof Error ? e.message : '';
		// UNIQUE(opportunity_id) on jobs — duplicate Won attempt (idempotent).
		if (/unique|duplicate/i.test(msg)) {
			const [existingJob] = await db
				.select()
				.from(jobs)
				.where(eq(jobs.opportunity_id, opp.id))
				.limit(1);
			const [current] = await db
				.select()
				.from(opportunities)
				.where(eq(opportunities.id, opp.id))
				.limit(1);
			return { opportunity: current ?? opp, job: existingJob ?? null };
		}
		throw e;
	}
}

/**
 * Marks an open opportunity as Lost with a structured reason and optional note,
 * emitting opportunity.lost onto the outbox. Returns null when the deal was
 * already closed (no transition happened). Shared by the pipeline status route
 * and the quote-declined worker handler.
 */
export async function markOpportunityLost(
	opp: Opportunity,
	lostReason: PipelineLostReason,
	lostReasonNote: string | null
): Promise<Opportunity | null> {
	const orgId = opp.org_id;
	return await db.transaction(async (tx) => {
		const now = new Date();
		const [updated] = await tx
			.update(opportunities)
			.set({
				status: 'lost',
				closed_at: now,
				lost_reason: lostReason,
				lost_reason_note: lostReasonNote,
				updated_at: now
			})
			.where(and(eq(opportunities.id, opp.id), eq(opportunities.status, 'open')))
			.returning();
		if (!updated) return null;

		await tx.insert(outboxEvents).values({
			org_id: orgId,
			event_type: 'opportunity.lost',
			resource_type: 'opportunity',
			resource_id: updated.id,
			payload: {
				event_version: 1,
				opportunity_id: updated.id,
				org_id: orgId,
				contact_id: updated.contact_id,
				title: updated.title,
				assigned_to: updated.assigned_to ?? null,
				value: updated.value,
				lost_reason: updated.lost_reason
			},
			idempotency_key: `opportunity.lost:${updated.id}`
		});

		return updated;
	});
}
