import { json, error } from '@sveltejs/kit';
import { and, desc, eq, inArray, isNull, lt, or, sql, type SQL } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import {
	contacts,
	opportunities,
	orgCounters,
	quoteLineItems,
	quotes
} from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canCreateQuote, canViewAnyQuote } from '$lib/server/quotes/permissions';
import { createQuoteSchema } from '$lib/server/quotes/schemas';
import { computeLineTotal, recalcQuoteTotals } from '$lib/server/quotes/recalc';
import { randomPlaceholderHash } from '$lib/server/quotes/token';
import { formatQuoteNumber } from '$lib/server/quotes/format';

const PAGE_SIZE = 30;
const ALL_STATUSES = ['draft', 'sent', 'viewed', 'accepted', 'declined', 'expired'] as const;
const ACTIVE_STATUSES = ['draft', 'sent', 'viewed', 'changes_requested'] as const;
const CLOSED_STATUSES = ['accepted', 'declined', 'expired'] as const;

export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canViewAnyQuote(auth.member)) error(403, 'Forbidden');

	const url = event.url;
	const statusParam = url.searchParams.get('status') ?? 'all';
	const cursor = url.searchParams.get('cursor');

	const conditions: SQL[] = [eq(quotes.org_id, auth.orgId), isNull(quotes.deleted_at)];

	if (statusParam === 'active') {
		conditions.push(inArray(quotes.status, [...ACTIVE_STATUSES]));
	} else if (statusParam === 'closed') {
		conditions.push(inArray(quotes.status, [...CLOSED_STATUSES]));
	} else if ((ALL_STATUSES as readonly string[]).includes(statusParam)) {
		conditions.push(eq(quotes.status, statusParam as 'draft'));
	}

	if (cursor) {
		const [createdAt, id] = cursor.split('|');
		if (createdAt && id) {
			conditions.push(
				or(
					lt(quotes.created_at, new Date(createdAt)),
					and(eq(quotes.created_at, new Date(createdAt)), lt(quotes.id, id))
				) as SQL
			);
		}
	}

	const rows = await db
		.select({
			id: quotes.id,
			quote_number: quotes.quote_number,
			title: quotes.title,
			status: quotes.status,
			total: quotes.total,
			contact_id: quotes.contact_id,
			contact_name: contacts.full_name,
			sent_at: quotes.sent_at,
			viewed_at: quotes.viewed_at,
			accepted_at: quotes.accepted_at,
			declined_at: quotes.declined_at,
			expires_at: quotes.expires_at,
			created_at: quotes.created_at
		})
		.from(quotes)
		.innerJoin(contacts, eq(contacts.id, quotes.contact_id))
		.where(and(...conditions))
		.orderBy(desc(quotes.created_at), desc(quotes.id))
		.limit(PAGE_SIZE + 1);

	const hasMore = rows.length > PAGE_SIZE;
	const items = (hasMore ? rows.slice(0, PAGE_SIZE) : rows).map((r) => ({
		...r,
		quote_number_display: formatQuoteNumber(r.quote_number),
		created_at: r.created_at.toISOString(),
		sent_at: r.sent_at?.toISOString() ?? null,
		viewed_at: r.viewed_at?.toISOString() ?? null,
		accepted_at: r.accepted_at?.toISOString() ?? null,
		declined_at: r.declined_at?.toISOString() ?? null,
		expires_at: r.expires_at?.toISOString() ?? null
	}));
	const last = items[items.length - 1];
	const nextCursor = hasMore && last ? `${last.created_at}|${last.id}` : null;

	return json({ items, next_cursor: nextCursor });
};

export const POST: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canCreateQuote(auth.member)) error(403, 'Forbidden');

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const parsed = createQuoteSchema.safeParse(body);
	if (!parsed.success) {
		const field_errors: Record<string, string> = {};
		for (const issue of parsed.error.issues) {
			const path = issue.path.join('.');
			if (path && !field_errors[path]) field_errors[path] = issue.message;
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

	if (input.opportunity_id) {
		const [oppRow] = await db
			.select({ id: opportunities.id })
			.from(opportunities)
			.where(
				and(
					eq(opportunities.id, input.opportunity_id),
					eq(opportunities.org_id, auth.orgId),
					eq(opportunities.contact_id, input.contact_id),
					isNull(opportunities.deleted_at)
				)
			)
			.limit(1);
		if (!oppRow) {
			return json(
				{
					error: 'Opportunity does not belong to this contact',
					field_errors: { opportunity_id: 'Invalid opportunity' }
				},
				{ status: 422 }
			);
		}
	}

	const created = await db.transaction(async (tx) => {
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
				contact_id: input.contact_id,
				opportunity_id: input.opportunity_id ?? null,
				issued_by: auth.member.id,
				quote_number: quoteNumber,
				title: input.title,
				status: 'draft',
				tax_rate: input.tax_rate !== undefined ? String(input.tax_rate) : '0',
				deposit_required: input.deposit_required ?? false,
				deposit_amount:
					input.deposit_amount !== undefined && input.deposit_amount !== null
						? String(input.deposit_amount)
						: null,
				notes: input.notes ?? null,
				internal_notes: input.internal_notes ?? null,
				public_token_hash: randomPlaceholderHash()
			})
			.returning();

		if (input.line_items && input.line_items.length > 0) {
			await tx.insert(quoteLineItems).values(
				input.line_items.map((li, idx) => ({
					org_id: auth.orgId,
					quote_id: inserted.id,
					description: li.description,
					quantity: String(li.quantity),
					unit_price: String(li.unit_price),
					total: computeLineTotal(li.quantity, li.unit_price),
					position: li.position ?? idx
				}))
			);
			await recalcQuoteTotals(tx, inserted.id);
		}

		const [final] = await tx.select().from(quotes).where(eq(quotes.id, inserted.id)).limit(1);

		// Enforce deposit_amount < total when deposit is enabled. Runs after recalc
		// so the comparison uses authoritative totals.
		if (final.deposit_required && final.deposit_amount != null) {
			if (Number(final.deposit_amount) >= Number(final.total)) {
				throw error(422, 'Deposit amount must be less than the quote total');
			}
		}

		return final;
	});

	return json(
		{
			data: {
				id: created.id,
				quote_number: created.quote_number,
				quote_number_display: formatQuoteNumber(created.quote_number)
			}
		},
		{ status: 201 }
	);
};
