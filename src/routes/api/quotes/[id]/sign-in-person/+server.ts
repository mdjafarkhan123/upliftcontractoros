import { json, error } from '@sveltejs/kit';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { media, outboxEvents, quoteLineItems, quotePackages, quotes } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canEditQuote } from '$lib/server/quotes/permissions';
import { quoteAcceptedEvent } from '$lib/server/quotes/events';

// Record an IN-PERSON acceptance — "close in the field". The tech hands their device to the
// customer at the kitchen table, the customer draws their signature, and the quote is approved
// on the spot. Mirrors the offline mark-accepted route's money math EXACTLY (recompute the
// accepted total server-side from stored prices, never trust the browser) but additionally
// captures the customer's legal name + drawn signature image (already uploaded to R2 as a
// 'quote_signature' media row) as binding proof of acceptance.

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

	let signerName: string;
	let signatureMediaId: string;
	let requestedOptionalIds: string[] = [];
	// Good-Better-Best: the tier the customer chose. Required on a tiered quote, ignored on a
	// simple one. Validated against the quote's real packages inside the tx below.
	let requestedPackageId: string | null = null;
	try {
		const body = await event.request.json();
		const name = String(body?.signer_name ?? '').trim();
		if (!name || name.length < 2) {
			return json({ error: 'Please enter the customer’s full name to sign.' }, { status: 400 });
		}
		if (name.length > 200) {
			return json({ error: 'Name is too long.' }, { status: 400 });
		}
		signerName = name;
		const mediaId = String(body?.signature_media_id ?? '').trim();
		if (!mediaId) {
			return json({ error: 'Signature is required.' }, { status: 400 });
		}
		signatureMediaId = mediaId;
		const ids = Array.isArray(body?.selected_optional_ids) ? body.selected_optional_ids : [];
		requestedOptionalIds = ids
			.filter((v: unknown): v is string => typeof v === 'string')
			.slice(0, 200);
		requestedPackageId =
			typeof body?.selected_package_id === 'string' ? body.selected_package_id : null;
	} catch {
		return json({ error: 'Signature is required.' }, { status: 400 });
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
			throw error(422, 'Only a sent quote can be signed');
		}

		// The drawn signature must be a real 'quote_signature' media row for THIS quote + org —
		// the browser can never point acceptance at a foreign or unrelated image.
		const [sig] = await tx
			.select({ id: media.id })
			.from(media)
			.where(
				and(
					eq(media.id, signatureMediaId),
					eq(media.org_id, auth.orgId),
					eq(media.quote_id, quoteId),
					eq(media.purpose_tag, 'quote_signature'),
					isNull(media.deleted_at)
				)
			)
			.limit(1);
		if (!sig) throw error(400, 'Signature not found for this quote');

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
			.select({
				id: quoteLineItems.id,
				total: quoteLineItems.total,
				taxable: quoteLineItems.taxable
			})
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
		// Pre-discount TAXABLE subtotal = taxable required + taxable chosen add-ons.
		const taxableSubtotalCents = taxableBaseCents + taxableOptionalCents;
		// Quote-level discount applies to the whole accepted subtotal before tax — identical to
		// the public accept route (a percent scales with the selection; a fixed amount is clamped
		// so the total can never go negative). accepted_subtotal stays pre-discount.
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
			acceptance_signature_name: signerName,
			acceptance_signed_at: now,
			acceptance_signature_media_id: signatureMediaId,
			// The team member who facilitated the in-person signing.
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
