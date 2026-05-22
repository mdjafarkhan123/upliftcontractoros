import { json, error } from '@sveltejs/kit';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import {
	contacts,
	quoteChangeRequests,
	quoteLineItems,
	quoteViews,
	quotes
} from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import {
	canDeleteQuote,
	canEditQuote,
	canViewAnyQuote
} from '$lib/server/quotes/permissions';
import { updateQuoteSchema } from '$lib/server/quotes/schemas';
import { formatQuoteNumber } from '$lib/server/quotes/format';
import { computeLineTotal, recalcQuoteTotals } from '$lib/server/quotes/recalc';

export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canViewAnyQuote(auth.member)) error(403, 'Forbidden');

	const id = event.params.id!;
	const [row] = await db
		.select({
			id: quotes.id,
			quote_number: quotes.quote_number,
			title: quotes.title,
			status: quotes.status,
			subtotal: quotes.subtotal,
			tax_rate: quotes.tax_rate,
			tax_amount: quotes.tax_amount,
			total: quotes.total,
			deposit_required: quotes.deposit_required,
			deposit_amount: quotes.deposit_amount,
			deposit_paid_amount: quotes.deposit_paid_amount,
			deposit_paid_at: quotes.deposit_paid_at,
			notes: quotes.notes,
			internal_notes: quotes.internal_notes,
			expires_at: quotes.expires_at,
			sent_at: quotes.sent_at,
			viewed_at: quotes.viewed_at,
			accepted_at: quotes.accepted_at,
			declined_at: quotes.declined_at,
			created_at: quotes.created_at,
			updated_at: quotes.updated_at,
			contact_id: quotes.contact_id,
			contact_name: contacts.full_name,
			contact_phone: contacts.phone,
			contact_email: contacts.email,
			opportunity_id: quotes.opportunity_id
		})
		.from(quotes)
		.innerJoin(contacts, eq(contacts.id, quotes.contact_id))
		.where(and(eq(quotes.id, id), eq(quotes.org_id, auth.orgId), isNull(quotes.deleted_at)))
		.limit(1);

	if (!row) error(404, 'Quote not found');

	const lineItems = await db
		.select({
			id: quoteLineItems.id,
			description: quoteLineItems.description,
			quantity: quoteLineItems.quantity,
			unit_price: quoteLineItems.unit_price,
			total: quoteLineItems.total,
			position: quoteLineItems.position
		})
		.from(quoteLineItems)
		.where(
			and(
				eq(quoteLineItems.quote_id, id),
				eq(quoteLineItems.org_id, auth.orgId),
				isNull(quoteLineItems.deleted_at)
			)
		)
		.orderBy(asc(quoteLineItems.position), asc(quoteLineItems.created_at));

	const [{ count: viewCount }] = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(quoteViews)
		.where(and(eq(quoteViews.quote_id, id), eq(quoteViews.org_id, auth.orgId)));

	const [activeChangeRequest] = await db
		.select({
			id: quoteChangeRequests.id,
			message: quoteChangeRequests.message,
			requested_at: quoteChangeRequests.requested_at
		})
		.from(quoteChangeRequests)
		.where(
			and(
				eq(quoteChangeRequests.quote_id, id),
				eq(quoteChangeRequests.org_id, auth.orgId),
				isNull(quoteChangeRequests.resolved_at)
			)
		)
		.limit(1);

	return json({
		data: {
			...row,
			quote_number_display: formatQuoteNumber(row.quote_number),
			created_at: row.created_at.toISOString(),
			updated_at: row.updated_at.toISOString(),
			sent_at: row.sent_at?.toISOString() ?? null,
			viewed_at: row.viewed_at?.toISOString() ?? null,
			accepted_at: row.accepted_at?.toISOString() ?? null,
			declined_at: row.declined_at?.toISOString() ?? null,
			expires_at: row.expires_at?.toISOString() ?? null,
			deposit_paid_at: row.deposit_paid_at?.toISOString() ?? null,
			view_count: viewCount,
			line_items: lineItems,
			active_change_request: activeChangeRequest
				? {
						id: activeChangeRequest.id,
						message: activeChangeRequest.message,
						requested_at: activeChangeRequest.requested_at.toISOString()
					}
				: null
		}
	});
};

export const PATCH: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canEditQuote(auth.member)) error(403, 'Forbidden');

	const id = event.params.id!;

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const parsed = updateQuoteSchema.safeParse(body);
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

	const updated = await db.transaction(async (tx) => {
		const [existing] = await tx.execute<{
			id: string;
			status: string;
			tax_rate: string;
			total: string;
			deposit_paid_amount: number;
		}>(sql`
			SELECT id, status, tax_rate, total, deposit_paid_amount FROM quotes
			WHERE id = ${id} AND org_id = ${auth.orgId} AND deleted_at IS NULL
			FOR UPDATE
		`);
		if (!existing) throw error(404, 'Quote not found');
		if (existing.status !== 'draft' && existing.status !== 'changes_requested') {
			throw error(422, 'Only draft or change-requested quotes can be edited');
		}

		// Financial-field lock. Defense-in-depth: a quote with a collected deposit must
		// never have its financial values mutated, regardless of status.
		if (existing.deposit_paid_amount > 0) {
			const financialChange =
				input.tax_rate !== undefined ||
				input.deposit_required !== undefined ||
				input.deposit_amount !== undefined ||
				input.line_items !== undefined;
			if (financialChange) {
				throw error(422, 'Financial fields are locked after deposit collection');
			}
		}

		// deposit_amount must be strictly less than the quote total.
		if (input.deposit_required === true && input.deposit_amount != null) {
			const total = Number(existing.total);
			if (Number(input.deposit_amount) >= total) {
				throw error(422, 'Deposit amount must be less than the quote total');
			}
		}

		const updates: Record<string, unknown> = { updated_at: new Date() };
		if (input.title !== undefined) updates.title = input.title;
		if (input.tax_rate !== undefined) updates.tax_rate = String(input.tax_rate);
		if (input.deposit_required !== undefined) updates.deposit_required = input.deposit_required;
		if (input.deposit_amount !== undefined)
			updates.deposit_amount = input.deposit_amount === null ? null : String(input.deposit_amount);
		if (input.notes !== undefined) updates.notes = input.notes;
		if (input.internal_notes !== undefined) updates.internal_notes = input.internal_notes;

		await tx.update(quotes).set(updates).where(eq(quotes.id, id));

		if (input.line_items !== undefined) {
			await tx
				.update(quoteLineItems)
				.set({ deleted_at: new Date(), updated_at: new Date() })
				.where(
					and(eq(quoteLineItems.quote_id, id), isNull(quoteLineItems.deleted_at))
				);
			if (input.line_items.length > 0) {
				await tx.insert(quoteLineItems).values(
					input.line_items.map((li, idx) => ({
						org_id: auth.orgId,
						quote_id: id,
						description: li.description,
						quantity: String(li.quantity),
						unit_price: String(li.unit_price),
						total: computeLineTotal(li.quantity, li.unit_price),
						position: li.position ?? idx
					}))
				);
			}
			await recalcQuoteTotals(tx, id);
		} else if (input.tax_rate !== undefined) {
			await recalcQuoteTotals(tx, id);
		}

		const [row] = await tx.select().from(quotes).where(eq(quotes.id, id)).limit(1);

		// After recalc, enforce deposit_amount < total when deposit is enabled.
		if (row.deposit_required && row.deposit_amount != null) {
			if (Number(row.deposit_amount) >= Number(row.total)) {
				throw error(422, 'Deposit amount must be less than the quote total');
			}
		}

		return row;
	});

	return json({ data: { id: updated.id } });
};

export const DELETE: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canDeleteQuote(auth.member)) error(403, 'Forbidden');

	const id = event.params.id!;
	const result = await db
		.update(quotes)
		.set({ deleted_at: new Date(), updated_at: new Date() })
		.where(
			and(eq(quotes.id, id), eq(quotes.org_id, auth.orgId), isNull(quotes.deleted_at))
		)
		.returning({ id: quotes.id });

	if (result.length === 0) error(404, 'Quote not found');
	return new Response(null, { status: 204 });
};
