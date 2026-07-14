import { json, error } from '@sveltejs/kit';
import { and, asc, eq, inArray, isNull, notInArray, sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import {
	contactAddresses,
	contacts,
	media,
	outboxEvents,
	quoteChangeRequests,
	quoteLineItems,
	quotePackages,
	quoteViews,
	quotes
} from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canDeleteQuote, canEditQuote, canViewAnyQuote } from '$lib/server/quotes/permissions';
import { canViewCostMargin } from '$lib/server/finance/permissions';
import { updateQuoteSchema } from '$lib/server/quotes/schemas';
import { formatQuoteNumber } from '$lib/server/quotes/format';
import { computeLineTotal, recalcQuoteTotals } from '$lib/server/quotes/recalc';
import { assertAndIncrementUsage, BYTES_PER_GB } from '$lib/server/usage/assertAndIncrementUsage';

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
			current_version: quotes.current_version,
			subtotal: quotes.subtotal,
			discount_type: quotes.discount_type,
			discount_value: quotes.discount_value,
			discount_amount: quotes.discount_amount,
			discount_label: quotes.discount_label,
			tax_rate: quotes.tax_rate,
			tax_amount: quotes.tax_amount,
			total: quotes.total,
			deposit_required: quotes.deposit_required,
			deposit_type: quotes.deposit_type,
			deposit_percent: quotes.deposit_percent,
			deposit_amount: quotes.deposit_amount,
			deposit_paid_amount: quotes.deposit_paid_amount,
			deposit_paid_at: quotes.deposit_paid_at,
			accepted_subtotal: quotes.accepted_subtotal,
			accepted_tax_amount: quotes.accepted_tax_amount,
			accepted_total: quotes.accepted_total,
			notes: quotes.notes,
			internal_notes: quotes.internal_notes,
			terms: quotes.terms,
			expires_at: quotes.expires_at,
			sent_at: quotes.sent_at,
			viewed_at: quotes.viewed_at,
			accepted_at: quotes.accepted_at,
			declined_at: quotes.declined_at,
			acceptance_signature_name: quotes.acceptance_signature_name,
			acceptance_signed_at: quotes.acceptance_signed_at,
			acceptance_signature_media_id: quotes.acceptance_signature_media_id,
			created_at: quotes.created_at,
			updated_at: quotes.updated_at,
			contact_id: quotes.contact_id,
			contact_name: contacts.full_name,
			contact_phone: contacts.phone,
			contact_email: contacts.email,
			contact_sms_opt_out: contacts.sms_opt_out,
			opportunity_id: quotes.opportunity_id,
			service_address_id: quotes.service_address_id,
			addr_label: contactAddresses.label,
			addr_line_1: contactAddresses.address_line_1,
			addr_line_2: contactAddresses.address_line_2,
			addr_city: contactAddresses.city,
			addr_state: contactAddresses.state,
			addr_zip: contactAddresses.zip
		})
		.from(quotes)
		.innerJoin(contacts, eq(contacts.id, quotes.contact_id))
		.leftJoin(contactAddresses, eq(contactAddresses.id, quotes.service_address_id))
		.where(and(eq(quotes.id, id), eq(quotes.org_id, auth.orgId), isNull(quotes.deleted_at)))
		.limit(1);

	if (!row) error(404, 'Quote not found');

	const lineItems = await db
		.select({
			id: quoteLineItems.id,
			line_key: quoteLineItems.line_key,
			package_id: quoteLineItems.package_id,
			description: quoteLineItems.description,
			details: quoteLineItems.details,
			quantity: quoteLineItems.quantity,
			unit: quoteLineItems.unit,
			section_label: quoteLineItems.section_label,
			is_optional: quoteLineItems.is_optional,
			taxable: quoteLineItems.taxable,
			accepted_selected: quoteLineItems.accepted_selected,
			unit_price: quoteLineItems.unit_price,
			unit_cost: quoteLineItems.unit_cost,
			source_catalog_item_id: quoteLineItems.source_catalog_item_id,
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

	// Cost is private: blank it out for members without revenue access so it never
	// reaches their browser (the margin panel is hidden client-side too).
	const canCost = canViewCostMargin(auth.member);
	const safeLineItems = canCost
		? lineItems
		: lineItems.map((li) => ({ ...li, unit_cost: null }));

	// Good-Better-Best tiers (empty on a simple quote). Ordered for stable side-by-side render.
	const packages = await db
		.select({
			id: quotePackages.id,
			package_key: quotePackages.package_key,
			name: quotePackages.name,
			is_recommended: quotePackages.is_recommended,
			position: quotePackages.position,
			subtotal: quotePackages.subtotal,
			total: quotePackages.total
		})
		.from(quotePackages)
		.where(
			and(
				eq(quotePackages.quote_id, id),
				eq(quotePackages.org_id, auth.orgId),
				isNull(quotePackages.deleted_at)
			)
		)
		.orderBy(asc(quotePackages.position), asc(quotePackages.created_at));

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

	const { addr_label, addr_line_1, addr_line_2, addr_city, addr_state, addr_zip, ...quoteRow } =
		row;
	const service_address =
		row.service_address_id && addr_line_1
			? {
					id: row.service_address_id,
					label: addr_label!,
					address_line_1: addr_line_1,
					address_line_2: addr_line_2,
					city: addr_city!,
					state: addr_state!,
					zip: addr_zip!
				}
			: null;

	return json({
		data: {
			...quoteRow,
			service_address,
			quote_number_display: formatQuoteNumber(row.quote_number),
			created_at: row.created_at.toISOString(),
			updated_at: row.updated_at.toISOString(),
			sent_at: row.sent_at?.toISOString() ?? null,
			viewed_at: row.viewed_at?.toISOString() ?? null,
			accepted_at: row.accepted_at?.toISOString() ?? null,
			declined_at: row.declined_at?.toISOString() ?? null,
			acceptance_signature_name: row.acceptance_signature_name ?? null,
			acceptance_signed_at: row.acceptance_signed_at?.toISOString() ?? null,
			acceptance_signature_media_id: row.acceptance_signature_media_id ?? null,
			expires_at: row.expires_at?.toISOString() ?? null,
			deposit_paid_at: row.deposit_paid_at?.toISOString() ?? null,
			view_count: viewCount,
			packages,
			line_items: safeLineItems,
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
			contact_id: string;
			status: string;
			tax_rate: string;
			total: string;
			deposit_paid_amount: number;
			deposit_type: string;
		}>(sql`
			SELECT id, contact_id, status, tax_rate, total, deposit_paid_amount, deposit_type FROM quotes
			WHERE id = ${id} AND org_id = ${auth.orgId} AND deleted_at IS NULL
			FOR UPDATE
		`);
		if (!existing) throw error(404, 'Quote not found');
		// Edit-after-send: a quote stays editable while it is still out with the customer
		// (draft, sent, viewed, or change-requested). Accepted/declined/expired quotes are
		// closed records and stay locked. The deposit-collected financial lock below is the
		// second gate for a sent quote that has already taken money.
		if (
			existing.status !== 'draft' &&
			existing.status !== 'sent' &&
			existing.status !== 'viewed' &&
			existing.status !== 'changes_requested'
		) {
			throw error(422, 'This quote can no longer be edited');
		}

		// Financial-field lock. Defense-in-depth: a quote with a collected deposit must
		// never have its financial values mutated, regardless of status.
		if (existing.deposit_paid_amount > 0) {
			const financialChange =
				input.tax_rate !== undefined ||
				input.discount_type !== undefined ||
				input.discount_value !== undefined ||
				input.deposit_required !== undefined ||
				input.deposit_type !== undefined ||
				input.deposit_amount !== undefined ||
				input.deposit_percent !== undefined ||
				input.line_items !== undefined ||
				input.packages !== undefined;
			if (financialChange) {
				throw error(422, 'Financial fields are locked after deposit collection');
			}
		}

		// For fixed-type deposits, pre-validate deposit_amount < total before recalc.
		// Percent-type deposits are validated after recalcQuoteTotals computes deposit_amount.
		const effectiveDepositType = input.deposit_type ?? existing.deposit_type ?? 'fixed';
		if (
			input.deposit_required === true &&
			effectiveDepositType === 'fixed' &&
			input.deposit_amount != null
		) {
			const total = Number(existing.total);
			if (Number(input.deposit_amount) >= total) {
				throw error(422, 'Deposit amount must be less than the quote total');
			}
		}

		// Service address change: null clears it; a value must belong to this quote's contact.
		if (input.service_address_id !== undefined) {
			if (input.service_address_id === null) {
				// cleared below
			} else {
				const [addrRow] = await tx
					.select({ id: contactAddresses.id })
					.from(contactAddresses)
					.where(
						and(
							eq(contactAddresses.id, input.service_address_id),
							eq(contactAddresses.contact_id, existing.contact_id),
							eq(contactAddresses.org_id, auth.orgId),
							isNull(contactAddresses.deleted_at)
						)
					)
					.limit(1);
				if (!addrRow) {
					throw error(422, 'Service address does not belong to this contact');
				}
			}
		}

		const updates: Record<string, unknown> = { updated_at: new Date() };
		if (input.title !== undefined) updates.title = input.title;
		if (input.service_address_id !== undefined)
			updates.service_address_id = input.service_address_id ?? null;
		if (input.tax_rate !== undefined) updates.tax_rate = String(input.tax_rate);
		if (input.discount_type !== undefined) {
			updates.discount_type = input.discount_type;
			// Clearing to 'none' wipes value/label; recalc then nulls discount_amount.
			if (input.discount_type === 'none') {
				updates.discount_value = null;
				updates.discount_label = null;
			}
		}
		if (input.discount_value !== undefined)
			updates.discount_value = input.discount_value === null ? null : String(input.discount_value);
		if (input.discount_label !== undefined)
			updates.discount_label = input.discount_label?.trim() || null;
		if (input.expires_at !== undefined) updates.expires_at = input.expires_at ?? null;
		if (input.deposit_required !== undefined) updates.deposit_required = input.deposit_required;
		if (input.deposit_type !== undefined) updates.deposit_type = input.deposit_type;
		if (input.deposit_percent !== undefined)
			updates.deposit_percent =
				input.deposit_percent === null ? null : String(input.deposit_percent);
		if (input.deposit_amount !== undefined)
			updates.deposit_amount = input.deposit_amount === null ? null : String(input.deposit_amount);
		if (input.notes !== undefined) updates.notes = input.notes;
		if (input.internal_notes !== undefined) updates.internal_notes = input.internal_notes;
		if (input.terms !== undefined) updates.terms = input.terms;

		await tx.update(quotes).set(updates).where(eq(quotes.id, id));

		if (input.line_items !== undefined) {
			// Cost preservation: a member without revenue access edits the quote with the
			// cost column hidden, so their payload carries no unit_cost. Rather than blank
			// the owner's private costs, snapshot the current cost per line_key (captured
			// BEFORE the wipe below) and carry it forward on the reinsert.
			const canCost = canViewCostMargin(auth.member);
			const priorCostByKey = new Map<string, string | null>();
			if (!canCost) {
				const priorRows = await tx
					.select({ line_key: quoteLineItems.line_key, unit_cost: quoteLineItems.unit_cost })
					.from(quoteLineItems)
					.where(and(eq(quoteLineItems.quote_id, id), isNull(quoteLineItems.deleted_at)));
				for (const p of priorRows) priorCostByKey.set(p.line_key, p.unit_cost);
			}

			// Good-Better-Best: reconcile the tiers before the lines so each line can resolve
			// its package_id from the client-sent package_key. Only touched when the client
			// explicitly sends `packages` (a tiered edit always does; a simple edit omits it and
			// leaves packages alone). packages: [] converts a tiered quote back to simple.
			const packageKeyToId = new Map<string, string>();
			if (input.packages !== undefined) {
				await tx
					.update(quotePackages)
					.set({ deleted_at: new Date(), updated_at: new Date() })
					.where(and(eq(quotePackages.quote_id, id), isNull(quotePackages.deleted_at)));
				if (input.packages.length > 0) {
					const insertedPkgs = await tx
						.insert(quotePackages)
						.values(
							input.packages.map((p, idx) => ({
								org_id: auth.orgId,
								quote_id: id,
								package_key: p.package_key ?? undefined,
								name: p.name.trim(),
								is_recommended: p.is_recommended ?? false,
								position: p.position ?? idx
							}))
						)
						.returning({ id: quotePackages.id, package_key: quotePackages.package_key });
					for (const pk of insertedPkgs) packageKeyToId.set(pk.package_key, pk.id);
				}
				// Note: accepted_package_id is only ever set at acceptance, and edits are
				// restricted to draft/changes_requested quotes, so it is guaranteed null here —
				// no explicit clear needed when converting a tiered quote back to simple.
			}

			await tx
				.update(quoteLineItems)
				.set({ deleted_at: new Date(), updated_at: new Date() })
				.where(and(eq(quoteLineItems.quote_id, id), isNull(quoteLineItems.deleted_at)));
			if (input.line_items.length > 0) {
				await tx.insert(quoteLineItems).values(
					input.line_items.map((li, idx) => ({
						org_id: auth.orgId,
						quote_id: id,
						// undefined → DB default (fresh uuid); never pass null (column is NOT NULL).
						line_key: li.line_key ?? undefined,
						package_id: li.package_key ? (packageKeyToId.get(li.package_key) ?? null) : null,
						description: li.description,
						details: li.details?.trim() || null,
						quantity: String(li.quantity),
						unit: li.unit?.trim() || null,
						section_label: li.section_label?.trim() || null,
						is_optional: li.is_optional ?? false,
						taxable: li.taxable ?? true,
						unit_price: String(li.unit_price),
						unit_cost: canCost
							? li.unit_cost !== undefined && li.unit_cost !== null
								? String(li.unit_cost)
								: null
							: (li.line_key ? priorCostByKey.get(li.line_key) : null) ?? null,
						source_catalog_item_id: li.source_catalog_item_id ?? null,
						total: computeLineTotal(li.quantity, li.unit_price),
						position: li.position ?? idx
					}))
				);
			}
			await recalcQuoteTotals(tx, id);

			// Reconcile per-line photos to the surviving lines. Any quote_line_item_photo
			// whose line_key is no longer present (its line was removed) is orphaned — soft
			// delete it, release its storage quota, and emit media.deleted so the worker
			// removes the R2 objects (R2 deletion stays OUTSIDE this transaction, per the
			// outbox pattern). When no lines remain, every line photo is orphaned.
			const survivingKeys = input.line_items
				.map((li) => li.line_key)
				.filter((k): k is string => typeof k === 'string');
			const orphans = await tx
				.select({
					id: media.id,
					file_size_bytes: media.file_size_bytes,
					r2_key: media.r2_key,
					thumbnail_key: media.thumbnail_key,
					web_key: media.web_key
				})
				.from(media)
				.where(
					and(
						eq(media.quote_id, id),
						eq(media.org_id, auth.orgId),
						eq(media.purpose_tag, 'quote_line_item_photo'),
						isNull(media.deleted_at),
						survivingKeys.length > 0 ? notInArray(media.line_key, survivingKeys) : undefined
					)
				);

			if (orphans.length > 0) {
				const orphanIds = orphans.map((o) => o.id);
				await tx
					.update(media)
					.set({ deleted_at: new Date(), updated_at: new Date() })
					.where(inArray(media.id, orphanIds));

				const freedBytes = orphans.reduce((sum, o) => sum + o.file_size_bytes, 0);
				await assertAndIncrementUsage(tx, {
					orgId: auth.orgId,
					metric: 'storage_bytes',
					limit: auth.limits.max_storage_gb * BYTES_PER_GB,
					increment: -freedBytes
				});

				await tx
					.insert(outboxEvents)
					.values(
						orphans.map((o) => ({
							org_id: auth.orgId,
							event_type: 'media.deleted',
							resource_type: 'media',
							resource_id: o.id,
							payload: {
								media_id: o.id,
								org_id: auth.orgId,
								r2_key: o.r2_key,
								thumbnail_key: o.thumbnail_key,
								web_key: o.web_key
							},
							idempotency_key: `media.deleted:${o.id}`
						}))
					)
					.onConflictDoNothing({ target: outboxEvents.idempotency_key });
			}
		} else if (
			input.tax_rate !== undefined ||
			input.discount_type !== undefined ||
			input.discount_value !== undefined
		) {
			// Discount/tax changed without touching line items — still recompute the
			// authoritative discount_amount/tax/total (and percent deposit).
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

	// Accepted quotes are signed agreements (often with a collected deposit or a converted
	// invoice) — they are financial records and must not be deletable, even via direct API
	// calls. The status check and soft-delete run in one statement so the guard is atomic.
	const result = await db
		.update(quotes)
		.set({ deleted_at: new Date(), updated_at: new Date() })
		.where(
			and(
				eq(quotes.id, id),
				eq(quotes.org_id, auth.orgId),
				isNull(quotes.deleted_at),
				sql`${quotes.status} <> 'accepted'`
			)
		)
		.returning({ id: quotes.id });

	if (result.length === 0) {
		// Distinguish "blocked because accepted" from "genuinely not found" for a clear message.
		const [existing] = await db
			.select({ status: quotes.status })
			.from(quotes)
			.where(and(eq(quotes.id, id), eq(quotes.org_id, auth.orgId), isNull(quotes.deleted_at)))
			.limit(1);
		if (existing?.status === 'accepted') {
			return json({ error: 'Accepted quotes cannot be deleted' }, { status: 422 });
		}
		error(404, 'Quote not found');
	}
	return new Response(null, { status: 204 });
};
