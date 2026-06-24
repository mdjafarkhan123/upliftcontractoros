/**
 * Soft-delete purge engine.
 *
 * Permanently ("hard") deletes records that have sat in the recycle bin
 * (soft-deleted, i.e. `deleted_at` set) longer than the retention window. Driven
 * by the `soft-delete-purge-sweep` cron job (see cron/softDeletePurgeSweep.ts).
 *
 * Safety model — the foreign-key wall:
 *   Each record is purged inside its OWN transaction. We delete the record's
 *   exclusively-owned children (line items, views, messages, …) and then the
 *   record itself. If anything LIVE still references that record, Postgres
 *   rejects the parent delete with a foreign-key violation (code 23503); the
 *   transaction rolls back, the record is counted as `blocked`, and it stays put.
 *   This makes the sweep incapable of orphaning or destroying linked live data —
 *   the database itself is the guardrail. Same approach as hardPurgeContact().
 *
 * Money is never auto-erased:
 *   - Invoices are only considered when they have NO payment rows.
 *   - Quotes are only considered when no deposit was collected; a quote converted
 *     to an invoice is referenced by that invoice and so is FK-blocked anyway.
 *
 * Order matters: invoices are purged before quotes, and quotes/appointments
 * before opportunities/jobs, so that clearing a child first frees the parent for
 * purging within the same run.
 */
import { and, eq, isNotNull, lt, sql } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import {
	appointments,
	bookingLinks,
	catalogItems,
	contactAddresses,
	contactNotes,
	conversations,
	invoiceLineItems,
	invoiceViews,
	invoices,
	jobs,
	media,
	messengerIntegrations,
	messages,
	opportunities,
	opportunityFollowUps,
	pipelineStages,
	privateFeedback,
	quoteChangeRequests,
	quoteLineItems,
	quoteTemplateLineItems,
	quoteTemplates,
	quoteVersions,
	quoteViews,
	quotes,
	reviewEvents,
	reviewRequests
} from '$lib/server/db/schema';
import { r2DeleteObjects } from '$lib/server/media/r2';
import { createLogger } from '$lib/server/log';

const log = createLogger('soft-delete-purge');

export type EntityPurgeResult = {
	entity: string;
	scanned: number;
	purged: number;
	blocked: number;
};

/** Postgres foreign-key violation (23503) → the record is still referenced. */
function isForeignKeyViolation(e: unknown): boolean {
	if (e && typeof e === 'object') {
		const code = (e as { code?: string }).code;
		if (code === '23503') return true;
		const message = (e as { message?: string }).message ?? '';
		if (/foreign key/i.test(message)) return true;
		const cause = (e as { cause?: unknown }).cause;
		if (cause && cause !== e) return isForeignKeyViolation(cause);
	}
	return false;
}

/** Run a single record's purge transaction; classify FK rejection as `blocked`. */
async function guardPurge(run: () => Promise<void>): Promise<'purged' | 'blocked'> {
	try {
		await run();
		return 'purged';
	} catch (e) {
		if (isForeignKeyViolation(e)) return 'blocked';
		throw e;
	}
}

type ParentRow = { id: string; org_id: string };

/**
 * Generic per-entity driver: select up to `limit` expired parents, then purge
 * each in isolation. A non-FK error aborts this entity only — the caller catches
 * it so other entities still run.
 */
async function purgeEntity(
	entity: string,
	selectExpired: () => Promise<ParentRow[]>,
	purgeOne: (orgId: string, id: string) => Promise<void>
): Promise<EntityPurgeResult> {
	const rows = await selectExpired();
	let purged = 0;
	let blocked = 0;
	for (const row of rows) {
		const outcome = await guardPurge(() => purgeOne(row.org_id, row.id));
		if (outcome === 'purged') purged += 1;
		else blocked += 1;
	}
	return { entity, scanned: rows.length, purged, blocked };
}

/**
 * Media purge: collect R2 keys first, delete DB rows in individual transactions,
 * then batch-delete from R2 outside any transaction. If R2 deletion fails we log
 * a warning — the DB rows are already gone (orphaned storage is acceptable vs.
 * rolling back a committed delete). Mirrors the deleteOrg.ts R2-after-DB pattern.
 */
async function purgeMediaEntity(cutoff: Date, limit: number): Promise<EntityPurgeResult> {
	const rows = await db
		.select({
			id: media.id,
			org_id: media.org_id,
			r2_key: media.r2_key,
			thumbnail_key: media.thumbnail_key,
			web_key: media.web_key
		})
		.from(media)
		.where(and(isNotNull(media.deleted_at), lt(media.deleted_at, cutoff)))
		.limit(limit);

	let purged = 0;
	let blocked = 0;
	const r2Keys: string[] = [];

	for (const row of rows) {
		const outcome = await guardPurge(() =>
			db.transaction(async (tx) => {
				await tx.delete(media).where(and(eq(media.org_id, row.org_id), eq(media.id, row.id)));
			})
		);
		if (outcome === 'purged') {
			purged++;
			r2Keys.push(row.r2_key);
			if (row.thumbnail_key) r2Keys.push(row.thumbnail_key);
			if (row.web_key) r2Keys.push(row.web_key);
		} else {
			blocked++;
		}
	}

	if (r2Keys.length > 0) {
		try {
			await r2DeleteObjects(r2Keys);
		} catch (e) {
			const message = e instanceof Error ? e.message : String(e);
			log.warn({ entity: 'media', r2_keys: r2Keys.length, error: message, note: 'db_rows_already_deleted' });
		}
	}

	return { entity: 'media', scanned: rows.length, purged, blocked };
}

/**
 * Purge every covered entity. Each entity is wrapped so a failure in one never
 * stops the others; aggregate counts are returned for the cron log.
 */
export async function purgeSoftDeletedOlderThan(
	cutoff: Date,
	limitPerEntity = 500
): Promise<{ results: EntityPurgeResult[]; scanned: number; purged: number; blocked: number }> {
	const results: EntityPurgeResult[] = [];

	// Each definition: [entity name, expired-parent query, single-record purge].
	// Children are deleted children-first inside the per-record transaction; the
	// final parent delete is what the FK wall guards.
	const definitions: Array<() => Promise<EntityPurgeResult>> = [
		// ── Invoices (only those with NO payments — money is never auto-erased) ──
		() =>
			purgeEntity(
				'invoices',
				() =>
					db
						.select({ id: invoices.id, org_id: invoices.org_id })
						.from(invoices)
						.where(
							and(
								isNotNull(invoices.deleted_at),
								lt(invoices.deleted_at, cutoff),
								sql`NOT EXISTS (SELECT 1 FROM payments p WHERE p.invoice_id = ${invoices.id})`
							)
						)
						.limit(limitPerEntity),
				(orgId, id) =>
					db.transaction(async (tx) => {
						await tx
							.delete(invoiceLineItems)
							.where(and(eq(invoiceLineItems.org_id, orgId), eq(invoiceLineItems.invoice_id, id)));
						await tx
							.delete(invoiceViews)
							.where(and(eq(invoiceViews.org_id, orgId), eq(invoiceViews.invoice_id, id)));
						await tx.delete(invoices).where(and(eq(invoices.org_id, orgId), eq(invoices.id, id)));
					})
			),

		// ── Quotes (only those with no collected deposit; converted quotes are
		//    FK-blocked by the referencing invoice) ──
		() =>
			purgeEntity(
				'quotes',
				() =>
					db
						.select({ id: quotes.id, org_id: quotes.org_id })
						.from(quotes)
						.where(
							and(
								isNotNull(quotes.deleted_at),
								lt(quotes.deleted_at, cutoff),
								eq(quotes.deposit_paid_amount, 0)
							)
						)
						.limit(limitPerEntity),
				(orgId, id) =>
					db.transaction(async (tx) => {
						await tx
							.delete(quoteChangeRequests)
							.where(and(eq(quoteChangeRequests.org_id, orgId), eq(quoteChangeRequests.quote_id, id)));
						await tx
							.delete(quoteVersions)
							.where(and(eq(quoteVersions.org_id, orgId), eq(quoteVersions.quote_id, id)));
						await tx
							.delete(quoteViews)
							.where(and(eq(quoteViews.org_id, orgId), eq(quoteViews.quote_id, id)));
						await tx
							.delete(quoteLineItems)
							.where(and(eq(quoteLineItems.org_id, orgId), eq(quoteLineItems.quote_id, id)));
						await tx.delete(quotes).where(and(eq(quotes.org_id, orgId), eq(quotes.id, id)));
					})
			),

		// ── Quote templates ──
		() =>
			purgeEntity(
				'quote_templates',
				() =>
					db
						.select({ id: quoteTemplates.id, org_id: quoteTemplates.org_id })
						.from(quoteTemplates)
						.where(and(isNotNull(quoteTemplates.deleted_at), lt(quoteTemplates.deleted_at, cutoff)))
						.limit(limitPerEntity),
				(orgId, id) =>
					db.transaction(async (tx) => {
						await tx
							.delete(quoteTemplateLineItems)
							.where(
								and(
									eq(quoteTemplateLineItems.org_id, orgId),
									eq(quoteTemplateLineItems.template_id, id)
								)
							);
						await tx
							.delete(quoteTemplates)
							.where(and(eq(quoteTemplates.org_id, orgId), eq(quoteTemplates.id, id)));
					})
			),

		// ── Appointments (assignees cascade via FK) ──
		() =>
			purgeEntity(
				'appointments',
				() =>
					db
						.select({ id: appointments.id, org_id: appointments.org_id })
						.from(appointments)
						.where(and(isNotNull(appointments.deleted_at), lt(appointments.deleted_at, cutoff)))
						.limit(limitPerEntity),
				(orgId, id) =>
					db.transaction(async (tx) => {
						await tx
							.delete(appointments)
							.where(and(eq(appointments.org_id, orgId), eq(appointments.id, id)));
					})
			),

		// ── Jobs (no owned children; FK-blocked if reviews/invoices/appointments link) ──
		() =>
			purgeEntity(
				'jobs',
				() =>
					db
						.select({ id: jobs.id, org_id: jobs.org_id })
						.from(jobs)
						.where(and(isNotNull(jobs.deleted_at), lt(jobs.deleted_at, cutoff)))
						.limit(limitPerEntity),
				(orgId, id) =>
					db.transaction(async (tx) => {
						await tx.delete(jobs).where(and(eq(jobs.org_id, orgId), eq(jobs.id, id)));
					})
			),

		// ── Opportunities ──
		() =>
			purgeEntity(
				'opportunities',
				() =>
					db
						.select({ id: opportunities.id, org_id: opportunities.org_id })
						.from(opportunities)
						.where(and(isNotNull(opportunities.deleted_at), lt(opportunities.deleted_at, cutoff)))
						.limit(limitPerEntity),
				(orgId, id) =>
					db.transaction(async (tx) => {
						await tx
							.delete(opportunityFollowUps)
							.where(
								and(
									eq(opportunityFollowUps.org_id, orgId),
									eq(opportunityFollowUps.opportunity_id, id)
								)
							);
						await tx
							.delete(opportunities)
							.where(and(eq(opportunities.org_id, orgId), eq(opportunities.id, id)));
					})
			),

		// ── Conversations (owned messages deleted first; FK-blocked if a webchat
		//    session or media still references the thread/messages) ──
		() =>
			purgeEntity(
				'conversations',
				() =>
					db
						.select({ id: conversations.id, org_id: conversations.org_id })
						.from(conversations)
						.where(and(isNotNull(conversations.deleted_at), lt(conversations.deleted_at, cutoff)))
						.limit(limitPerEntity),
				(orgId, id) =>
					db.transaction(async (tx) => {
						await tx
							.delete(messages)
							.where(and(eq(messages.org_id, orgId), eq(messages.conversation_id, id)));
						await tx
							.delete(conversations)
							.where(and(eq(conversations.org_id, orgId), eq(conversations.id, id)));
					})
			),

		// ── Contact notes / addresses soft-deleted on their own ──
		() =>
			purgeEntity(
				'contact_notes',
				() =>
					db
						.select({ id: contactNotes.id, org_id: contactNotes.org_id })
						.from(contactNotes)
						.where(and(isNotNull(contactNotes.deleted_at), lt(contactNotes.deleted_at, cutoff)))
						.limit(limitPerEntity),
				(orgId, id) =>
					db.transaction(async (tx) => {
						await tx
							.delete(contactNotes)
							.where(and(eq(contactNotes.org_id, orgId), eq(contactNotes.id, id)));
					})
			),
		() =>
			purgeEntity(
				'contact_addresses',
				() =>
					db
						.select({ id: contactAddresses.id, org_id: contactAddresses.org_id })
						.from(contactAddresses)
						.where(
							and(isNotNull(contactAddresses.deleted_at), lt(contactAddresses.deleted_at, cutoff))
						)
						.limit(limitPerEntity),
				(orgId, id) =>
					db.transaction(async (tx) => {
						await tx
							.delete(contactAddresses)
							.where(and(eq(contactAddresses.org_id, orgId), eq(contactAddresses.id, id)));
					})
			),

		// ── Phase 2 ─────────────────────────────────────────────────────────────

		// ── Media (R2 objects deleted after DB row — see purgeMediaEntity) ──
		() => purgeMediaEntity(cutoff, limitPerEntity),

		// ── Soft-deleted private feedback (reviews/feedback sent to the contractor,
		//    not the public review; owned by job but freestanding) ──
		() =>
			purgeEntity(
				'private_feedback',
				() =>
					db
						.select({ id: privateFeedback.id, org_id: privateFeedback.org_id })
						.from(privateFeedback)
						.where(
							and(isNotNull(privateFeedback.deleted_at), lt(privateFeedback.deleted_at, cutoff))
						)
						.limit(limitPerEntity),
				(orgId, id) =>
					db.transaction(async (tx) => {
						await tx
							.delete(privateFeedback)
							.where(and(eq(privateFeedback.org_id, orgId), eq(privateFeedback.id, id)));
					})
			),

		// ── Review requests (event log deleted first; FK wall blocks if a
		//    positive `reviews` row still references the request — that review
		//    stays put and the request is kept as its anchor) ──
		() =>
			purgeEntity(
				'review_requests',
				() =>
					db
						.select({ id: reviewRequests.id, org_id: reviewRequests.org_id })
						.from(reviewRequests)
						.where(
							and(isNotNull(reviewRequests.deleted_at), lt(reviewRequests.deleted_at, cutoff))
						)
						.limit(limitPerEntity),
				(orgId, id) =>
					db.transaction(async (tx) => {
						await tx
							.delete(reviewEvents)
							.where(
								and(eq(reviewEvents.org_id, orgId), eq(reviewEvents.review_request_id, id))
							);
						await tx
							.delete(reviewRequests)
							.where(and(eq(reviewRequests.org_id, orgId), eq(reviewRequests.id, id)));
					})
			),

		// ── Booking links (availability_windows + availability_overrides cascade
		//    automatically; FK wall blocks if live appointments still reference
		//    this link via booked_via_link_id) ──
		() =>
			purgeEntity(
				'booking_links',
				() =>
					db
						.select({ id: bookingLinks.id, org_id: bookingLinks.org_id })
						.from(bookingLinks)
						.where(and(isNotNull(bookingLinks.deleted_at), lt(bookingLinks.deleted_at, cutoff)))
						.limit(limitPerEntity),
				(orgId, id) =>
					db.transaction(async (tx) => {
						await tx
							.delete(bookingLinks)
							.where(and(eq(bookingLinks.org_id, orgId), eq(bookingLinks.id, id)));
					})
			),

		// ── Messenger integrations (soft-deleted when a contractor disconnects
		//    their Facebook Page; messenger_contacts uses a plain text page_id
		//    field — no FK to this table — so no child cleanup needed) ──
		() =>
			purgeEntity(
				'messenger_integrations',
				() =>
					db
						.select({ id: messengerIntegrations.id, org_id: messengerIntegrations.org_id })
						.from(messengerIntegrations)
						.where(
							and(
								isNotNull(messengerIntegrations.deleted_at),
								lt(messengerIntegrations.deleted_at, cutoff)
							)
						)
						.limit(limitPerEntity),
				(orgId, id) =>
					db.transaction(async (tx) => {
						await tx
							.delete(messengerIntegrations)
							.where(and(eq(messengerIntegrations.org_id, orgId), eq(messengerIntegrations.id, id)));
					})
			),

		// ── Catalog items (Price Book entries); quote_line_items.source_catalog_item_id
		//    is ON DELETE SET NULL so no FK blocking ──
		() =>
			purgeEntity(
				'catalog_items',
				() =>
					db
						.select({ id: catalogItems.id, org_id: catalogItems.org_id })
						.from(catalogItems)
						.where(and(isNotNull(catalogItems.deleted_at), lt(catalogItems.deleted_at, cutoff)))
						.limit(limitPerEntity),
				(orgId, id) =>
					db.transaction(async (tx) => {
						await tx
							.delete(catalogItems)
							.where(and(eq(catalogItems.org_id, orgId), eq(catalogItems.id, id)));
					})
			),

		// ── Pipeline stages; FK wall blocks if any opportunity still uses this
		//    stage (opportunities.stage_id → pipeline_stages.id), keeping the
		//    stage alive until the deal is moved or also purged ──
		() =>
			purgeEntity(
				'pipeline_stages',
				() =>
					db
						.select({ id: pipelineStages.id, org_id: pipelineStages.org_id })
						.from(pipelineStages)
						.where(
							and(isNotNull(pipelineStages.deleted_at), lt(pipelineStages.deleted_at, cutoff))
						)
						.limit(limitPerEntity),
				(orgId, id) =>
					db.transaction(async (tx) => {
						await tx
							.delete(pipelineStages)
							.where(and(eq(pipelineStages.org_id, orgId), eq(pipelineStages.id, id)));
					})
			)
	];

	for (const run of definitions) {
		try {
			results.push(await run());
		} catch (e) {
			const message = e instanceof Error ? e.message : String(e);
			results.push({ entity: 'error', scanned: 0, purged: 0, blocked: 0 });
			console.error('[soft-delete-purge] entity failed:', message);
		}
	}

	const scanned = results.reduce((s, r) => s + r.scanned, 0);
	const purged = results.reduce((s, r) => s + r.purged, 0);
	const blocked = results.reduce((s, r) => s + r.blocked, 0);
	return { results, scanned, purged, blocked };
}
