import { json } from '@sveltejs/kit';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { outboxEvents, quoteLineItems, quotePackages, quotes } from '$lib/server/db/schema';
import { clientIpFrom, lookupQuoteForAction, sha256Hex } from '$lib/server/quotes/publicAccess';
import { rateLimit } from '$lib/server/quotes/rateLimit';
import { quoteAcceptedEvent } from '$lib/server/quotes/events';

function unavailable(): Response {
	return json({ error: 'Quote no longer available' }, { status: 404 });
}

// Money lives in numeric strings. Compute in integer cents so the accepted total is exact.
function toCents(s: string): number {
	return Math.round(Number(s) * 100);
}
function centsToString(c: number): string {
	return `${Math.floor(c / 100)}.${String(c % 100).padStart(2, '0')}`;
}

export const POST: RequestHandler = async (event) => {
	const rawIp = clientIpFrom(event.request);
	const ipHash = sha256Hex(rawIp);
	const rl = await rateLimit('q.accept', ipHash, 10, 60);
	if (!rl.ok) return json({ error: 'Quote no longer available' }, { status: 429 });

	let signerName: string;
	let requestedOptionalIds: string[];
	// Good-Better-Best: the tier the customer selected. Required on a tiered quote, ignored on
	// a simple one. Validated against the quote's real packages inside the tx below.
	let requestedPackageId: string | null;
	try {
		const body = await event.request.json();
		const name = String(body?.signer_name ?? '').trim();
		if (!name || name.length < 2) {
			return json({ error: 'Please enter your full name to sign.' }, { status: 400 });
		}
		if (name.length > 200) {
			return json({ error: 'Name is too long.' }, { status: 400 });
		}
		signerName = name;
		// Optional add-ons the customer ticked. We never trust these as-is — they are
		// intersected with the quote's real optional lines below and the total is recomputed
		// server-side from stored prices, so the browser can never set the price.
		const ids = Array.isArray(body?.selected_optional_ids) ? body.selected_optional_ids : [];
		requestedOptionalIds = ids
			.filter((v: unknown): v is string => typeof v === 'string')
			.slice(0, 200);
		requestedPackageId =
			typeof body?.selected_package_id === 'string' ? body.selected_package_id : null;
	} catch {
		return json({ error: 'Please enter your full name to sign.' }, { status: 400 });
	}

	const token = event.params.token!;
	const result = await lookupQuoteForAction(token);

	if (!result.ok) {
		if (result.alreadyTerminal === 'accepted') {
			return json({ data: { status: 'accepted' } });
		}
		return unavailable();
	}

	const quote = result.quote;
	const txResult = await db.transaction(async (tx) => {
		const [locked] = await tx.execute<{
			status: string;
			subtotal: string;
			discount_type: string;
			discount_value: string | null;
			tax_rate: string;
			deposit_required: boolean;
			deposit_type: string;
			deposit_percent: string | null;
		}>(sql`
			SELECT status, subtotal, discount_type, discount_value, tax_rate,
			       deposit_required, deposit_type, deposit_percent
			FROM quotes WHERE id = ${quote.id} FOR UPDATE
		`);
		if (!locked) return { kind: 'noop' as const };
		if (locked.status === 'accepted') return { kind: 'noop' as const };
		if (locked.status !== 'sent' && locked.status !== 'viewed') return { kind: 'noop' as const };

		// Good-Better-Best: load this quote's tiers. Empty = simple quote (today's behavior).
		const pkgs = await tx
			.select({ id: quotePackages.id })
			.from(quotePackages)
			.where(and(eq(quotePackages.quote_id, quote.id), isNull(quotePackages.deleted_at)));

		let selectedPackageId: string | null = null;
		if (pkgs.length > 0) {
			// Tiered: the customer MUST pick exactly one of this quote's real packages. Anything
			// missing or foreign is rejected — the browser can never smuggle another tier's price.
			if (!requestedPackageId || !pkgs.some((p) => p.id === requestedPackageId)) {
				return {
					kind: 'error' as const,
					status: 400,
					message: 'Please choose a package to continue.'
				};
			}
			selectedPackageId = requestedPackageId;
		}

		// Base (required) lines. Scoped to the SELECTED tier when tiered — the base subtotal is
		// recomputed from stored prices here, NOT read from quotes.subtotal (which mirrors the
		// recommended tier and would over/under-charge when the customer picks a different one).
		const requiredLines = await tx
			.select({ total: quoteLineItems.total, taxable: quoteLineItems.taxable })
			.from(quoteLineItems)
			.where(
				and(
					eq(quoteLineItems.quote_id, quote.id),
					isNull(quoteLineItems.deleted_at),
					eq(quoteLineItems.is_optional, false),
					selectedPackageId ? eq(quoteLineItems.package_id, selectedPackageId) : undefined
				)
			);
		const baseSubtotalCents = requiredLines.reduce((sum, l) => sum + toCents(l.total), 0);
		// Per-line tax: only the taxable required lines feed the tax base.
		const taxableBaseCents = requiredLines.reduce(
			(sum, l) => sum + (l.taxable ? toCents(l.total) : 0),
			0
		);

		// Optional add-ons the customer could tick — scoped to the selected tier when tiered.
		const optionalLines = await tx
			.select({
				id: quoteLineItems.id,
				total: quoteLineItems.total,
				taxable: quoteLineItems.taxable
			})
			.from(quoteLineItems)
			.where(
				and(
					eq(quoteLineItems.quote_id, quote.id),
					isNull(quoteLineItems.deleted_at),
					eq(quoteLineItems.is_optional, true),
					selectedPackageId ? eq(quoteLineItems.package_id, selectedPackageId) : undefined
				)
			);

		const requested = new Set(requestedOptionalIds);
		const selected = optionalLines.filter((l) => requested.has(l.id));
		const selectedIds = selected.map((l) => l.id);

		// Accepted figures = the selected tier's base (required items) + the chosen optional
		// add-ons. Recomputed here from stored prices.
		const optionalCents = selected.reduce((sum, l) => sum + toCents(l.total), 0);
		// Taxable portion of the chosen add-ons.
		const taxableOptionalCents = selected.reduce(
			(sum, l) => sum + (l.taxable ? toCents(l.total) : 0),
			0
		);
		// Pre-discount subtotal = base required items + the optional add-ons chosen.
		const acceptedSubtotalCents = baseSubtotalCents + optionalCents;
		// Pre-discount TAXABLE subtotal = taxable required + taxable chosen add-ons.
		const taxableSubtotalCents = taxableBaseCents + taxableOptionalCents;
		// Quote-level discount applies to the WHOLE accepted subtotal (base + chosen
		// add-ons) before tax — industry standard. Percent scales with the selection; a
		// fixed amount is clamped so the total can never go negative. accepted_subtotal
		// stays pre-discount; the applied discount is derivable as
		// accepted_subtotal − (accepted_total − accepted_tax).
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
		// When every line is taxable, taxableSubtotalCents === acceptedSubtotalCents and this
		// collapses to discountedSubtotalCents * taxRate exactly.
		const taxableAfterDiscountCents =
			acceptedSubtotalCents > 0
				? (taxableSubtotalCents * discountedSubtotalCents) / acceptedSubtotalCents
				: 0;
		const acceptedTaxCents = Math.round(
			taxableAfterDiscountCents * (Number.isFinite(taxRate) ? taxRate : 0)
		);
		const acceptedTotalCents = discountedSubtotalCents + acceptedTaxCents;

		const now = new Date();

		// Mark which optional lines the customer chose. Defensive reset to false first so a
		// re-run can never leave a stale selection (accept is single-shot, but cheap safety).
		await tx
			.update(quoteLineItems)
			.set({ accepted_selected: false, updated_at: now })
			.where(
				and(
					eq(quoteLineItems.quote_id, quote.id),
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
			acceptance_signature_name: signerName,
			acceptance_signature_ip: rawIp,
			acceptance_signed_at: now,
			// Null on a simple quote (no tiers); the chosen tier on a Good-Better-Best quote.
			accepted_package_id: selectedPackageId,
			accepted_subtotal: centsToString(acceptedSubtotalCents),
			accepted_tax_amount: centsToString(acceptedTaxCents),
			accepted_total: centsToString(acceptedTotalCents)
		};
		// A percentage deposit follows the accepted total, so chosen add-ons raise the deposit.
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

		await tx.update(quotes).set(updates).where(eq(quotes.id, quote.id));

		await tx
			.insert(outboxEvents)
			.values(quoteAcceptedEvent({ orgId: quote.org_id, quoteId: quote.id }))
			.onConflictDoNothing({ target: outboxEvents.idempotency_key });

		return { kind: 'accepted' as const };
	});

	if (txResult.kind === 'error') {
		return json({ error: txResult.message }, { status: txResult.status });
	}
	return json({ data: { status: 'accepted' } });
};
