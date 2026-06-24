import { json, error } from '@sveltejs/kit';
import { and, asc, eq, isNull } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { quoteVersions, quotes } from '$lib/server/db/schema';
import type { QuoteVersionLineItem } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canViewAnyQuote } from '$lib/server/quotes/permissions';
import type { QuoteVersionDetail, QuoteVersionLineItemView } from '$lib/types/quotes';

// Money lives in numeric strings end-to-end. Diff in integer cents so deltas
// stay exact, then re-emit a numeric(12,2)-style string for display.
function toCents(s: string): number {
	return Math.round(Number(s) * 100);
}
function centsToString(c: number): string {
	const sign = c < 0 ? '-' : '';
	const abs = Math.abs(c);
	return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/**
 * Full version history of a quote: every frozen snapshot (v1 = first send,
 * v2+ = each revise-and-resend) with its line items and a change summary vs the
 * previous version. Read-only dispute record — gated like the timeline.
 */
export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canViewAnyQuote(auth.member)) error(403, 'Forbidden');

	const id = event.params.id!;

	const [quote] = await db
		.select({ id: quotes.id })
		.from(quotes)
		.where(and(eq(quotes.id, id), eq(quotes.org_id, auth.orgId), isNull(quotes.deleted_at)))
		.limit(1);
	if (!quote) error(404, 'Quote not found');

	const rows = await db
		.select({
			version: quoteVersions.version,
			subtotal: quoteVersions.subtotal,
			tax_rate: quoteVersions.tax_rate,
			tax_amount: quoteVersions.tax_amount,
			total: quoteVersions.total,
			line_items: quoteVersions.line_items,
			sent_at: quoteVersions.sent_at
		})
		.from(quoteVersions)
		.where(and(eq(quoteVersions.quote_id, id), eq(quoteVersions.org_id, auth.orgId)))
		.orderBy(asc(quoteVersions.version));

	const versions: QuoteVersionDetail[] = rows.map((row, i) => {
		const items = (row.line_items as QuoteVersionLineItem[]) ?? [];
		const lineItems: QuoteVersionLineItemView[] = [...items]
			.sort((a, b) => a.position - b.position)
			.map((li) => ({
				description: li.description,
				details: li.details ?? null,
				quantity: li.quantity,
				unit: li.unit,
				section_label: li.section_label ?? null,
				is_optional: li.is_optional ?? false,
				unit_price: li.unit_price,
				total: li.total,
				position: li.position
			}));

		const prev = i > 0 ? rows[i - 1] : null;
		const prevItems = prev ? ((prev.line_items as QuoteVersionLineItem[]) ?? []) : [];

		// Discount isn't stored on the snapshot, but it's exactly derivable: the frozen
		// subtotal is pre-discount and total is post-discount, so
		// discount = subtotal − (total − tax). Null when there was none.
		const discountCents = toCents(row.subtotal) - (toCents(row.total) - toCents(row.tax_amount));

		return {
			version: row.version,
			sent_at: row.sent_at.toISOString(),
			subtotal: row.subtotal,
			discount_amount: discountCents > 0 ? centsToString(discountCents) : null,
			tax_rate: row.tax_rate,
			tax_amount: row.tax_amount,
			total: row.total,
			item_count: lineItems.length,
			line_items: lineItems,
			change: prev
				? {
						prev_version: prev.version,
						prev_item_count: prevItems.length,
						prev_total: prev.total,
						item_count_delta: lineItems.length - prevItems.length,
						total_delta: centsToString(toCents(row.total) - toCents(prev.total))
					}
				: null
		};
	});

	return json({ data: { versions } });
};
