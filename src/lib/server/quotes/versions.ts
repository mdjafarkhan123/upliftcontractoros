import { and, asc, eq, isNull } from 'drizzle-orm';
import type { db as DbClient } from '$lib/server/db/client';
import { quoteLineItems, quotePackages, quoteVersions, quotes } from '$lib/server/db/schema';
import type { QuoteVersionLineItem } from '$lib/server/db/schema';

type Tx = Parameters<Parameters<typeof DbClient.transaction>[0]>[0];

/**
 * Freeze the current state of a quote into an immutable quote_versions snapshot row.
 * Captures the totals AND a JSON snapshot of the (non-deleted) line items so a past
 * version can be reconstructed exactly for disputes. Caller MUST hold a row lock on
 * the quote (SELECT ... FOR UPDATE) so the snapshot is consistent with the totals it
 * is being sent at. Inserts inside the caller's transaction. Idempotent on
 * (quote_id, version) via the unique index — a redelivered send no-ops.
 */
export async function snapshotQuoteVersion(
	tx: Tx,
	args: { orgId: string; quoteId: string; version: number; sentAt: Date }
): Promise<void> {
	const [q] = await tx
		.select({
			subtotal: quotes.subtotal,
			tax_rate: quotes.tax_rate,
			tax_amount: quotes.tax_amount,
			total: quotes.total
		})
		.from(quotes)
		.where(eq(quotes.id, args.quoteId))
		.limit(1);
	if (!q) return;

	// Left-join the tier so a Good-Better-Best snapshot freezes which package each line was in
	// (name + stable key). Both are null on a simple quote.
	const items = await tx
		.select({
			description: quoteLineItems.description,
			details: quoteLineItems.details,
			quantity: quoteLineItems.quantity,
			unit: quoteLineItems.unit,
			section_label: quoteLineItems.section_label,
			is_optional: quoteLineItems.is_optional,
			taxable: quoteLineItems.taxable,
			package_key: quotePackages.package_key,
			package_name: quotePackages.name,
			unit_price: quoteLineItems.unit_price,
			total: quoteLineItems.total,
			position: quoteLineItems.position
		})
		.from(quoteLineItems)
		.leftJoin(quotePackages, eq(quotePackages.id, quoteLineItems.package_id))
		.where(and(eq(quoteLineItems.quote_id, args.quoteId), isNull(quoteLineItems.deleted_at)))
		.orderBy(asc(quoteLineItems.position), asc(quoteLineItems.created_at));

	const lineItems: QuoteVersionLineItem[] = items.map((li) => ({
		description: li.description,
		details: li.details,
		quantity: li.quantity,
		unit: li.unit,
		section_label: li.section_label,
		is_optional: li.is_optional,
		taxable: li.taxable,
		package_key: li.package_key,
		package_name: li.package_name,
		unit_price: li.unit_price,
		total: li.total,
		position: li.position
	}));

	await tx
		.insert(quoteVersions)
		.values({
			org_id: args.orgId,
			quote_id: args.quoteId,
			version: args.version,
			subtotal: q.subtotal,
			tax_rate: q.tax_rate,
			tax_amount: q.tax_amount,
			total: q.total,
			line_items: lineItems,
			sent_at: args.sentAt
		})
		.onConflictDoNothing({ target: [quoteVersions.quote_id, quoteVersions.version] });
}
