import { json, error } from '@sveltejs/kit';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { orgCounters, quoteLineItems, quotePackages, quotes } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canCreateQuote } from '$lib/server/quotes/permissions';
import { recalcQuoteTotals } from '$lib/server/quotes/recalc';
import { randomPlaceholderHash } from '$lib/server/quotes/token';
import { formatQuoteNumber } from '$lib/server/quotes/format';

// Clone an existing quote into a fresh DRAFT. Everything that describes the work is
// copied (title, tax, deposit settings, notes, line items); everything tied to the
// original's lifecycle (status, send/view/accept history, totals frozen at acceptance,
// deposit payment, signature, public link) is reset so the copy starts clean.
export const POST: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canCreateQuote(auth.member)) error(403, 'Forbidden');

	const sourceId = event.params.id!;

	const created = await db.transaction(async (tx) => {
		const [source] = await tx
			.select({
				contact_id: quotes.contact_id,
				title: quotes.title,
				tax_rate: quotes.tax_rate,
				deposit_required: quotes.deposit_required,
				deposit_type: quotes.deposit_type,
				deposit_percent: quotes.deposit_percent,
				deposit_amount: quotes.deposit_amount,
				notes: quotes.notes,
				internal_notes: quotes.internal_notes
			})
			.from(quotes)
			.where(and(eq(quotes.id, sourceId), eq(quotes.org_id, auth.orgId), isNull(quotes.deleted_at)))
			.limit(1);
		if (!source) throw error(404, 'Quote not found');

		const sourceLines = await tx
			.select({
				package_id: quoteLineItems.package_id,
				description: quoteLineItems.description,
				quantity: quoteLineItems.quantity,
				unit: quoteLineItems.unit,
				section_label: quoteLineItems.section_label,
				is_optional: quoteLineItems.is_optional,
				taxable: quoteLineItems.taxable,
				unit_price: quoteLineItems.unit_price,
				unit_cost: quoteLineItems.unit_cost,
				source_catalog_item_id: quoteLineItems.source_catalog_item_id,
				total: quoteLineItems.total,
				position: quoteLineItems.position
			})
			.from(quoteLineItems)
			.where(
				and(
					eq(quoteLineItems.quote_id, sourceId),
					eq(quoteLineItems.org_id, auth.orgId),
					isNull(quoteLineItems.deleted_at)
				)
			)
			.orderBy(asc(quoteLineItems.position));

		// Good-Better-Best: copy the source tiers too. Carry each source package_key onto the
		// copy (it has no unique constraint) so we can remap each copied line's package_id from
		// the original package id → new package id. Empty on a simple quote.
		const sourcePackages = await tx
			.select({
				id: quotePackages.id,
				package_key: quotePackages.package_key,
				name: quotePackages.name,
				is_recommended: quotePackages.is_recommended,
				position: quotePackages.position
			})
			.from(quotePackages)
			.where(
				and(
					eq(quotePackages.quote_id, sourceId),
					eq(quotePackages.org_id, auth.orgId),
					isNull(quotePackages.deleted_at)
				)
			)
			.orderBy(asc(quotePackages.position));

		// Allocate the next quote number (same self-healing pattern as the create route).
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
				contact_id: source.contact_id,
				// Deliberately NOT carried over — a fresh draft is unlinked from the
				// original's deal; the contractor links it where it belongs.
				opportunity_id: null,
				issued_by: auth.member.id,
				quote_number: quoteNumber,
				title: `${source.title} (Copy)`,
				status: 'draft',
				tax_rate: source.tax_rate,
				deposit_required: source.deposit_required,
				deposit_type: source.deposit_type,
				deposit_percent: source.deposit_percent,
				// For a percent deposit, recalc recomputes the dollar amount after line
				// items land. For a fixed deposit, carry the original amount over.
				deposit_amount: source.deposit_type === 'percent' ? null : source.deposit_amount,
				notes: source.notes,
				internal_notes: source.internal_notes,
				public_token_hash: randomPlaceholderHash()
			})
			.returning();

		// Insert copied packages first, then map original package id → new package id (via the
		// carried package_key) so each copied line re-points at the copy's own tier.
		const newPackageIdByOrigId = new Map<string, string>();
		if (sourcePackages.length > 0) {
			const insertedPkgs = await tx
				.insert(quotePackages)
				.values(
					sourcePackages.map((p, idx) => ({
						org_id: auth.orgId,
						quote_id: inserted.id,
						package_key: p.package_key,
						name: p.name,
						is_recommended: p.is_recommended,
						position: p.position ?? idx
					}))
				)
				.returning({ id: quotePackages.id, package_key: quotePackages.package_key });
			const newIdByKey = new Map(insertedPkgs.map((pk) => [pk.package_key, pk.id]));
			for (const p of sourcePackages) {
				const newId = newIdByKey.get(p.package_key);
				if (newId) newPackageIdByOrigId.set(p.id, newId);
			}
		}

		if (sourceLines.length > 0) {
			await tx.insert(quoteLineItems).values(
				sourceLines.map((li, idx) => ({
					org_id: auth.orgId,
					quote_id: inserted.id,
					package_id: li.package_id ? (newPackageIdByOrigId.get(li.package_id) ?? null) : null,
					description: li.description,
					quantity: li.quantity,
					unit: li.unit,
					section_label: li.section_label,
					is_optional: li.is_optional,
					taxable: li.taxable,
					unit_price: li.unit_price,
					unit_cost: li.unit_cost,
					source_catalog_item_id: li.source_catalog_item_id,
					total: li.total,
					position: li.position ?? idx
				}))
			);
			await recalcQuoteTotals(tx, inserted.id);
		}

		return inserted;
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
