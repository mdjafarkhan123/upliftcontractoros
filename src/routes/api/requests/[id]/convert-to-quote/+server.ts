import { json, error } from '@sveltejs/kit';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import {
	orgCounters,
	outboxEvents,
	quoteLineItems,
	quotes,
	requestLineItems,
	requests
} from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canManageRequests } from '$lib/server/requests/permissions';
import { canCreateQuote } from '$lib/server/quotes/permissions';
import { recalcQuoteTotals } from '$lib/server/quotes/recalc';
import { randomPlaceholderHash } from '$lib/server/quotes/token';
import { formatQuoteNumber } from '$lib/server/quotes/format';
import { loadRequestDetail } from '$lib/server/requests/detail';

// Convert a Request into a draft Quote (Jobber "Convert to Quote"). One of the
// four exits in the assessment-completed popup. Snapshot-copies the request's
// line items into the new quote, then STAMPS THE REQUEST CONVERTED FOREVER
// (terminal, Jobber rule — never reverts, even if the quote is later deleted).
// The whole thing is one transaction so a request can never end up half-converted.
export const POST: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canManageRequests(auth.member) || !canCreateQuote(auth.member)) error(403, 'Forbidden');

	const requestId = event.params.id;

	const result = await db.transaction(async (tx) => {
		// Lock the request so two convert clicks can't race into two quotes.
		const [req] = await tx
			.select({
				id: requests.id,
				contact_id: requests.contact_id,
				title: requests.title,
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

		// Terminal + idempotent: if it already produced a quote, hand that id back so the
		// UI just navigates there. If it converted to a JOB, that's a hard 409.
		if (req.converted_to_quote_id) {
			return { existing: true, id: req.converted_to_quote_id };
		}
		if (req.converted_to_job_id) {
			throw error(409, 'This request was already converted to a job.');
		}

		// Snapshot source: the request's own line items (independent copy from here on).
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

		// Allocate the quote number. Self-heal a missing counter row (legacy orgs) before
		// locking so conversion never hard-fails; counters default to 1.
		await tx.execute(sql`
			INSERT INTO org_counters (org_id) VALUES (${auth.orgId})
			ON CONFLICT (org_id) DO NOTHING
		`);
		const [counter] = await tx.execute<{ next_quote_number: number }>(sql`
			SELECT next_quote_number FROM org_counters WHERE org_id = ${auth.orgId} FOR UPDATE
		`);
		if (!counter) throw new Error('Org counter missing');
		const quoteNumber = counter.next_quote_number;
		await tx
			.update(orgCounters)
			.set({ next_quote_number: quoteNumber + 1, updated_at: new Date() })
			.where(eq(orgCounters.org_id, auth.orgId));

		const [inserted] = await tx
			.insert(quotes)
			.values({
				org_id: auth.orgId,
				contact_id: req.contact_id,
				// Provenance back-link → the request detail drawer on the quote page.
				request_id: req.id,
				issued_by: auth.member.id,
				quote_number: quoteNumber,
				title: req.title,
				status: 'draft',
				public_token_hash: randomPlaceholderHash()
			})
			.returning({ id: quotes.id });

		if (sourceLines.length > 0) {
			await tx.insert(quoteLineItems).values(
				sourceLines.map((li) => ({
					org_id: auth.orgId,
					quote_id: inserted.id,
					// Carry the line's stable identity so per-line photos could re-bind later.
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
			await recalcQuoteTotals(tx, inserted.id);
		}

		const now = new Date();
		await tx
			.update(requests)
			.set({ converted_to_quote_id: inserted.id, converted_at: now, updated_at: now })
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
				converted_to: 'quote',
				quote_id: inserted.id
			},
			idempotency_key: `request.converted:${req.id}`
		});

		return { existing: false, id: inserted.id, quote_number: quoteNumber };
	});

	// Write-through: return the fresh request detail so the client patches its stores.
	const detail = await loadRequestDetail(
		auth.orgId,
		requestId,
		auth.org.timezone || 'America/Chicago'
	);

	return json(
		{
			data: {
				id: result.id,
				already_existed: result.existing,
				quote_number_display:
					result.quote_number != null ? formatQuoteNumber(result.quote_number) : null,
				request: detail
			}
		},
		{ status: result.existing ? 200 : 201 }
	);
};
