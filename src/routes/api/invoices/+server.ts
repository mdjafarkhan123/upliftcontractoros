import { json, error } from '@sveltejs/kit';
import {
	and,
	asc,
	desc,
	eq,
	gt,
	inArray,
	isNotNull,
	isNull,
	lt,
	or,
	sql,
	type SQL
} from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import {
	contacts,
	invoiceLineItems,
	invoices,
	orgCounters,
	outboxEvents,
	payments,
	quoteLineItems,
	quotes
} from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canCreateInvoice, canViewAnyInvoice } from '$lib/server/invoices/permissions';
import { createInvoiceSchema } from '$lib/server/invoices/schemas';
import { textMatch, textRank } from '$lib/server/search/textSearch';
import { generateToken } from '$lib/server/quotes/token';
import { computeLineTotal, recalcInvoiceTotals } from '$lib/server/invoices/recalc';
import { formatCurrencyUsd, formatInvoiceNumber } from '$lib/server/invoices/format';
import { invoicePaidEvent, paymentRecordedEvent } from '$lib/server/invoices/events';
import { formatQuoteNumber } from '$lib/server/quotes/format';

const PAGE_SIZE = 30;
const ALL_STATUSES = ['draft', 'sent', 'partially_paid', 'paid', 'overdue', 'cancelled'] as const;
const OPEN_STATUSES = ['sent', 'partially_paid', 'overdue'] as const;
const CLOSED_STATUSES = ['paid', 'cancelled'] as const;

export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canViewAnyInvoice(auth.member)) error(403, 'Forbidden');

	const url = event.url;
	const statusParam = url.searchParams.get('status') ?? 'all';
	const searchRaw = (url.searchParams.get('q') ?? '').trim();
	const cursor = url.searchParams.get('cursor');

	const conditions: SQL[] = [eq(invoices.org_id, auth.orgId), isNull(invoices.deleted_at)];

	if (statusParam === 'open') {
		conditions.push(inArray(invoices.status, [...OPEN_STATUSES]));
	} else if (statusParam === 'closed') {
		conditions.push(inArray(invoices.status, [...CLOSED_STATUSES]));
	} else if (statusParam === 'overdue') {
		// Effective overdue: actual 'overdue' status OR sent/partially_paid past due_date.
		// The nightly cron (deferred) will eventually flip these to 'overdue' status.
		conditions.push(
			or(
				eq(invoices.status, 'overdue'),
				and(
					inArray(invoices.status, ['sent', 'partially_paid']),
					isNotNull(invoices.due_date),
					lt(invoices.due_date, sql`CURRENT_DATE`),
					gt(invoices.amount_due, '0')
				)
			) as SQL
		);
	} else if ((ALL_STATUSES as readonly string[]).includes(statusParam)) {
		conditions.push(eq(invoices.status, statusParam as 'draft'));
	}

	// Fuzzy search across invoice title + linked contact name/company, plus an
	// exact/prefix match on the invoice number so typing "1042" finds invoice #1042.
	const isSearching = searchRaw.length > 0;
	const searchFields = [invoices.title, contacts.full_name, contacts.company_name];
	let relevance: SQL<number> | null = null;
	if (isSearching) {
		relevance = textRank(searchRaw, searchFields);
		const matchClauses: SQL[] = [textMatch(searchRaw, searchFields)];
		if (/^\d+$/.test(searchRaw)) {
			matchClauses.push(sql`CAST(${invoices.invoice_number} AS text) LIKE ${`${searchRaw}%`}`);
		}
		conditions.push(or(...matchClauses) as SQL);
	}

	if (cursor) {
		if (isSearching && relevance) {
			const [rankStr, createdAt, id] = cursor.split('|');
			const rank = Number(rankStr);
			if (Number.isFinite(rank) && createdAt && id) {
				conditions.push(
					or(
						gt(relevance, rank),
						and(eq(relevance, rank), lt(invoices.created_at, new Date(createdAt))),
						and(
							eq(relevance, rank),
							eq(invoices.created_at, new Date(createdAt)),
							lt(invoices.id, id)
						)
					) as SQL
				);
			}
		} else {
			const [createdAt, id] = cursor.split('|');
			if (createdAt && id) {
				conditions.push(
					or(
						lt(invoices.created_at, new Date(createdAt)),
						and(eq(invoices.created_at, new Date(createdAt)), lt(invoices.id, id))
					) as SQL
				);
			}
		}
	}

	const rows = await db
		.select({
			id: invoices.id,
			invoice_number: invoices.invoice_number,
			title: invoices.title,
			status: invoices.status,
			total: invoices.total,
			amount_paid: invoices.amount_paid,
			amount_due: invoices.amount_due,
			due_date: invoices.due_date,
			contact_id: invoices.contact_id,
			contact_name: contacts.full_name,
			sent_at: invoices.sent_at,
			paid_at: invoices.paid_at,
			created_at: invoices.created_at,
			rank: relevance ?? sql<number>`0`
		})
		.from(invoices)
		.innerJoin(contacts, eq(contacts.id, invoices.contact_id))
		.where(and(...conditions))
		.orderBy(...(relevance ? [relevance] : []), desc(invoices.created_at), desc(invoices.id))
		.limit(PAGE_SIZE + 1);

	const hasMore = rows.length > PAGE_SIZE;
	const sliced = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
	const items = sliced.map(({ rank: _rank, ...r }) => ({
		...r,
		invoice_number_display: formatInvoiceNumber(r.invoice_number),
		created_at: r.created_at.toISOString(),
		sent_at: r.sent_at?.toISOString() ?? null,
		paid_at: r.paid_at?.toISOString() ?? null
	}));
	const last = sliced[sliced.length - 1];
	const nextCursor =
		hasMore && last
			? isSearching
				? `${last.rank}|${last.created_at.toISOString()}|${last.id}`
				: `${last.created_at.toISOString()}|${last.id}`
			: null;

	return json({ items, next_cursor: nextCursor });
};

export const POST: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canCreateInvoice(auth.member)) error(403, 'Forbidden');

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const parsed = createInvoiceSchema.safeParse(body);
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

	const [contactRow] = await db
		.select({ id: contacts.id })
		.from(contacts)
		.where(
			and(
				eq(contacts.id, input.contact_id),
				eq(contacts.org_id, auth.orgId),
				isNull(contacts.deleted_at)
			)
		)
		.limit(1);
	if (!contactRow) return json({ error: 'Contact not found' }, { status: 422 });

	if (input.quote_id) {
		const [q] = await db
			.select({ id: quotes.id })
			.from(quotes)
			.where(
				and(eq(quotes.id, input.quote_id), eq(quotes.org_id, auth.orgId), isNull(quotes.deleted_at))
			)
			.limit(1);
		if (!q) return json({ error: 'Quote not found' }, { status: 422 });
	}

	const created = await db.transaction(async (tx) => {
		// Self-heal: legacy orgs created before org_counters was seeded at provisioning
		// may have no counter row. Ensure one exists before locking so invoice creation
		// never hard-fails. Counters default to 1, so a bare insert seeds correctly.
		await tx.execute(sql`
			INSERT INTO org_counters (org_id) VALUES (${auth.orgId})
			ON CONFLICT (org_id) DO NOTHING
		`);
		const [counter] = await tx.execute<{ next_invoice_number: number }>(sql`
			SELECT next_invoice_number FROM org_counters WHERE org_id = ${auth.orgId} FOR UPDATE
		`);
		if (!counter) throw new Error('Org counter missing');
		const invoiceNumber = counter.next_invoice_number;

		await tx
			.update(orgCounters)
			.set({ next_invoice_number: invoiceNumber + 1, updated_at: new Date() })
			.where(eq(orgCounters.org_id, auth.orgId));

		const rawToken = generateToken();
		const [inserted] = await tx
			.insert(invoices)
			.values({
				org_id: auth.orgId,
				contact_id: input.contact_id,
				job_id: input.job_id ?? null,
				opportunity_id: input.opportunity_id ?? null,
				quote_id: input.quote_id ?? null,
				issued_by: auth.member.id,
				invoice_number: invoiceNumber,
				title: input.title,
				status: 'draft',
				tax_rate: input.tax_rate !== undefined ? String(input.tax_rate) : '0',
				due_date: input.due_date ?? null,
				notes: input.notes ?? null,
				public_token: rawToken
			})
			.returning();

		let lineItemsToInsert: Array<{
			description: string;
			quantity: string;
			unit_price: string;
			total: string;
			position: number;
		}> = [];

		if (input.line_items && input.line_items.length > 0) {
			lineItemsToInsert = input.line_items.map((li, idx) => ({
				description: li.description,
				quantity: String(li.quantity),
				unit_price: String(li.unit_price),
				total: computeLineTotal(li.quantity, li.unit_price),
				position: li.position ?? idx
			}));
		} else if (input.quote_id) {
			const sourceLines = await tx
				.select({
					description: quoteLineItems.description,
					quantity: quoteLineItems.quantity,
					unit_price: quoteLineItems.unit_price,
					total: quoteLineItems.total,
					position: quoteLineItems.position
				})
				.from(quoteLineItems)
				.where(
					and(
						eq(quoteLineItems.quote_id, input.quote_id),
						eq(quoteLineItems.org_id, auth.orgId),
						isNull(quoteLineItems.deleted_at),
						// Required lines plus only the optional add-ons the customer accepted.
						or(
							eq(quoteLineItems.is_optional, false),
							eq(quoteLineItems.accepted_selected, true)
						)
					)
				)
				.orderBy(asc(quoteLineItems.position), asc(quoteLineItems.created_at));
			lineItemsToInsert = sourceLines;
		}

		if (lineItemsToInsert.length > 0) {
			await tx.insert(invoiceLineItems).values(
				lineItemsToInsert.map((li) => ({
					org_id: auth.orgId,
					invoice_id: inserted.id,
					description: li.description,
					quantity: li.quantity,
					unit_price: li.unit_price,
					total: li.total,
					position: li.position
				}))
			);
			await recalcInvoiceTotals(tx, inserted.id);
		}

		// Auto-apply paid quote deposit as a payment credit on this invoice.
		// Guarded by: deposit_applied_invoice_id IS NULL (first invoice only)
		// AND payments.stripe_payment_intent_id partial unique index (DB-level no-double-credit).
		if (input.quote_id) {
			const [q] = await tx.execute<{
				id: string;
				quote_number: number;
				deposit_paid_amount: number;
				deposit_stripe_payment_intent_id: string | null;
				deposit_applied_invoice_id: string | null;
			}>(sql`
				SELECT id, quote_number, deposit_paid_amount, deposit_stripe_payment_intent_id,
				       deposit_applied_invoice_id
				FROM quotes
				WHERE id = ${input.quote_id} AND org_id = ${auth.orgId}
				FOR UPDATE
			`);
			if (
				q &&
				q.deposit_paid_amount > 0 &&
				q.deposit_stripe_payment_intent_id &&
				q.deposit_applied_invoice_id === null
			) {
				const amountStr = (q.deposit_paid_amount / 100).toFixed(2);
				const quoteNumberDisplay = formatQuoteNumber(q.quote_number);

				const [payment] = await tx
					.insert(payments)
					.values({
						org_id: auth.orgId,
						invoice_id: inserted.id,
						amount: amountStr,
						payment_method: 'stripe',
						stripe_payment_intent_id: q.deposit_stripe_payment_intent_id,
						notes: `Deposit applied from Quote ${quoteNumberDisplay}`,
						recorded_by: null
					})
					.returning({ id: payments.id });

				await tx
					.update(quotes)
					.set({ deposit_applied_invoice_id: inserted.id, updated_at: new Date() })
					.where(eq(quotes.id, q.id));

				await recalcInvoiceTotals(tx, inserted.id);

				const [after] = await tx.execute<{
					status: string;
					total: string;
					invoice_number: number;
				}>(sql`
					SELECT status, total, invoice_number FROM invoices WHERE id = ${inserted.id}
				`);

				await tx.insert(outboxEvents).values(
					paymentRecordedEvent({
						orgId: auth.orgId,
						invoiceId: inserted.id,
						paymentId: payment.id,
						amountFormatted: formatCurrencyUsd(amountStr),
						invoiceNumberDisplay: formatInvoiceNumber(after.invoice_number)
					})
				);

				if (after.status === 'paid') {
					await tx
						.insert(outboxEvents)
						.values(
							invoicePaidEvent({
								orgId: auth.orgId,
								invoiceId: inserted.id,
								paymentId: payment.id,
								totalFormatted: formatCurrencyUsd(after.total),
								invoiceNumberDisplay: formatInvoiceNumber(after.invoice_number)
							})
						)
						.onConflictDoNothing({ target: outboxEvents.idempotency_key });
				}
			}
		}

		const [final] = await tx.select().from(invoices).where(eq(invoices.id, inserted.id)).limit(1);
		return final;
	});

	return json(
		{
			data: {
				id: created.id,
				invoice_number: created.invoice_number,
				invoice_number_display: formatInvoiceNumber(created.invoice_number)
			}
		},
		{ status: 201 }
	);
};
