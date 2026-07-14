import { json, error } from '@sveltejs/kit';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { outboxEvents, quoteLineItems, quotePackages, quotes } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canEditQuote } from '$lib/server/quotes/permissions';
import { quoteAcceptedEvent } from '$lib/server/quotes/events';

// Record an OFFLINE acceptance — the customer approved by phone or in person, not via
// the public link. Mirrors the public accept route's money math exactly (recompute the
// accepted total server-side from stored prices) but skips the e-signature and any Stripe
// deposit collection. The contractor confirms which optional add-ons the customer agreed to.

function toCents(s: string): number {
	return Math.round(Number(s) * 100);
}
function centsToString(c: number): string {
	return `${Math.floor(c / 100)}.${String(c % 100).padStart(2, '0')}`;
}

export const POST: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canEditQuote(auth.member)) error(403, 'Forbidden');

	const quoteId = event.params.id!;

	let requestedOptionalIds: string[] = [];
	// Good-Better-Best: the tier the contractor confirms the customer agreed to. Required on a
	// tiered quote, ignored on a simple one.
	let requestedPackageId: string | null = null;
	try {
		const body = await event.request.json();
		const ids = Array.isArray(body?.selected_optional_ids) ? body.selected_optional_ids : [];
		requestedOptionalIds = ids
			.filter((v: unknown): v is string => typeof v === 'string')
			.slice(0, 200);
		requestedPackageId =
			typeof body?.selected_package_id === 'string' ? body.selected_package_id : null;
	} catch {
		// No body / invalid JSON → accept the base quote with no optional add-ons.
		requestedOptionalIds = [];
	}

	const result = await db.transaction(async (tx) => {
		const [locked] = await tx.execute<{
			id: string;
			org_id: string;
			status: string;
			subtotal: string;
			discount_type: string;
			discount_value: string | null;
			tax_rate: string;
			deposit_required: boolean;
			deposit_type: string;
			deposit_percent: string | null;
		}>(sql`
			SELECT id, org_id, status, subtotal, discount_type, discount_value, tax_rate,
			       deposit_required, deposit_type, deposit_percent
			FROM quotes
			WHERE id = ${quoteId} AND org_id = ${auth.orgId} AND deleted_at IS NULL
			FOR UPDATE
		`);
		if (!locked) throw error(404, 'Quote not found');
		if (locked.status === 'accepted') return { status: 'accepted' as const, alreadyDone: true };
		if (
			locked.status !== 'sent' &&
			locked.status !== 'viewed' &&
			locked.status !== 'changes_requested'
		) {
			throw error(422, 'Only a sent quote can be marked accepted');
		}

		// Good-Better-Best tiers on this quote. Empty = simple quote (today's behavior).
		const pkgs = await tx
			.select({ id: quotePackages.id })
			.from(quotePackages)
			.where(and(eq(quotePackages.quote_id, quoteId), isNull(quotePackages.deleted_at)));

		let selectedPackageId: string | null = null;
		if (pkgs.length > 0) {
			if (!requestedPackageId || !pkgs.some((p) => p.id === requestedPackageId)) {
				throw error(400, 'Choose which package the customer accepted');
			}
			selectedPackageId = requestedPackageId;
		}

		// Base (required) lines — scoped to the accepted tier when tiered. Recomputed from stored
		// prices, NOT read from quotes.subtotal (which mirrors only the recommended tier).
		const requiredLines = await tx
			.select({ total: quoteLineItems.total, taxable: quoteLineItems.taxable })
			.from(quoteLineItems)
			.where(
				and(
					eq(quoteLineItems.quote_id, quoteId),
					isNull(quoteLineItems.deleted_at),
					eq(quoteLineItems.is_optional, false),
					selectedPackageId ? eq(quoteLineItems.package_id, selectedPackageId) : undefined
				)
			);
		const baseSubtotalCents = requiredLines.reduce((sum, l) => sum + toCents(l.total), 0);
		// Per-line tax: only taxable required lines feed the tax base.
		const taxableBaseCents = requiredLines.reduce(
			(sum, l) => sum + (l.taxable ? toCents(l.total) : 0),
			0
		);

		// Optional add-ons — scoped to the accepted tier when tiered.
		const optionalLines = await tx
			.select({ id: quoteLineItems.id, total: quoteLineItems.total, taxable: quoteLineItems.taxable })
			.from(quoteLineItems)
			.where(
				and(
					eq(quoteLineItems.quote_id, quoteId),
					isNull(quoteLineItems.deleted_at),
					eq(quoteLineItems.is_optional, true),
					selectedPackageId ? eq(quoteLineItems.package_id, selectedPackageId) : undefined
				)
			);

		const requested = new Set(requestedOptionalIds);
		const selected = optionalLines.filter((l) => requested.has(l.id));
		const selectedIds = selected.map((l) => l.id);

		const optionalCents = selected.reduce((sum, l) => sum + toCents(l.total), 0);
		const taxableOptionalCents = selected.reduce(
			(sum, l) => sum + (l.taxable ? toCents(l.total) : 0),
			0
		);
		// Pre-discount subtotal = base required items + the optional add-ons chosen.
		const acceptedSubtotalCents = baseSubtotalCents + optionalCents;
		// Only the taxable portion is taxed (labor commonly non-taxable).
		const taxableSubtotalCents = taxableBaseCents + taxableOptionalCents;
		// Quote-level discount applies to the whole accepted subtotal before tax — identical to
		// the public accept + sign-in-person routes (a percent scales with the selection; a fixed
		// amount is clamped so the total can never go negative). accepted_subtotal stays pre-discount.
		const discountValue = Number(locked.discount_value);
		let discountCents = 0;
		if (locked.discount_type === 'percent' && Number.isFinite(discountValue) && discountValue > 0) {
			discountCents = Math.round((acceptedSubtotalCents * Math.min(discountValue, 100)) / 100);
		} else if (
			locked.discount_type === 'fixed' &&
			Number.isFinite(discountValue) &&
			discountValue > 0
		) {
			discountCents = Math.min(Math.round(discountValue * 100), acceptedSubtotalCents);
		}
		const discountedSubtotalCents = acceptedSubtotalCents - discountCents;
		const taxRate = Number(locked.tax_rate);
		// Allocate the discount proportionally to the taxable base, then tax only that share.
		const taxableAfterDiscountCents =
			acceptedSubtotalCents > 0
				? (taxableSubtotalCents * discountedSubtotalCents) / acceptedSubtotalCents
				: 0;
		const acceptedTaxCents = Math.round(
			taxableAfterDiscountCents * (Number.isFinite(taxRate) ? taxRate : 0)
		);
		const acceptedTotalCents = discountedSubtotalCents + acceptedTaxCents;

		const now = new Date();

		await tx
			.update(quoteLineItems)
			.set({ accepted_selected: false, updated_at: now })
			.where(
				and(
					eq(quoteLineItems.quote_id, quoteId),
					eq(quoteLineItems.is_optional, true),
					isNull(quoteLineItems.deleted_at)
				)
			);
		if (selectedIds.length > 0) {
			await tx
				.update(quoteLineItems)
				.set({ accepted_selected: true, updated_at: now })
				.where(inArray(quoteLineItems.id, selectedIds));
		}

		const updates: Record<string, unknown> = {
			status: 'accepted',
			accepted_at: now,
			updated_at: now,
			offline_marked_by: auth.member.id,
			accepted_package_id: selectedPackageId,
			accepted_subtotal: centsToString(acceptedSubtotalCents),
			accepted_tax_amount: centsToString(acceptedTaxCents),
			accepted_total: centsToString(acceptedTotalCents)
		};
		// A percentage deposit follows the accepted total.
		if (
			locked.deposit_required &&
			locked.deposit_type === 'percent' &&
			locked.deposit_percent != null
		) {
			const pct = Number(locked.deposit_percent);
			if (Number.isFinite(pct) && pct > 0) {
				updates.deposit_amount = centsToString(Math.round((acceptedTotalCents * pct) / 100));
			}
		}

		await tx.update(quotes).set(updates).where(eq(quotes.id, quoteId));

		await tx
			.insert(outboxEvents)
			.values(quoteAcceptedEvent({ orgId: locked.org_id, quoteId }))
			.onConflictDoNothing({ target: outboxEvents.idempotency_key });

		return { status: 'accepted' as const, alreadyDone: false };
	});

	return json({ data: result });
};
