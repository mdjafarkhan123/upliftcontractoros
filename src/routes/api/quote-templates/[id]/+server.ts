import { json, error } from '@sveltejs/kit';
import { and, asc, eq, isNull } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { quoteTemplateLineItems, quoteTemplates } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canManageTemplates, canViewTemplates } from '$lib/server/quotes/permissions';
import { updateTemplateSchema } from '$lib/server/quotes/schemas';
import { computeLineTotal } from '$lib/server/quotes/recalc';

export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canViewTemplates(auth.member)) error(403, 'Forbidden');

	const id = event.params.id!;
	const [tpl] = await db
		.select()
		.from(quoteTemplates)
		.where(
			and(
				eq(quoteTemplates.id, id),
				eq(quoteTemplates.org_id, auth.orgId),
				isNull(quoteTemplates.deleted_at)
			)
		)
		.limit(1);
	if (!tpl) error(404, 'Template not found');

	const lineItems = await db
		.select({
			id: quoteTemplateLineItems.id,
			description: quoteTemplateLineItems.description,
			details: quoteTemplateLineItems.details,
			quantity: quoteTemplateLineItems.quantity,
			unit: quoteTemplateLineItems.unit,
			section_label: quoteTemplateLineItems.section_label,
			is_optional: quoteTemplateLineItems.is_optional,
			taxable: quoteTemplateLineItems.taxable,
			unit_price: quoteTemplateLineItems.unit_price,
			total: quoteTemplateLineItems.total,
			position: quoteTemplateLineItems.position
		})
		.from(quoteTemplateLineItems)
		.where(
			and(
				eq(quoteTemplateLineItems.template_id, id),
				eq(quoteTemplateLineItems.org_id, auth.orgId),
				isNull(quoteTemplateLineItems.deleted_at)
			)
		)
		.orderBy(asc(quoteTemplateLineItems.position));

	return json({
		data: {
			id: tpl.id,
			name: tpl.name,
			description: tpl.description,
			created_at: tpl.created_at.toISOString(),
			line_item_count: lineItems.length,
			line_items: lineItems
		}
	});
};

export const PATCH: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canManageTemplates(auth.member)) error(403, 'Forbidden');

	const id = event.params.id!;
	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const parsed = updateTemplateSchema.safeParse(body);
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

	await db.transaction(async (tx) => {
		const [tpl] = await tx
			.select({ id: quoteTemplates.id })
			.from(quoteTemplates)
			.where(
				and(
					eq(quoteTemplates.id, id),
					eq(quoteTemplates.org_id, auth.orgId),
					isNull(quoteTemplates.deleted_at)
				)
			)
			.limit(1);
		if (!tpl) throw error(404, 'Template not found');

		const updates: Record<string, unknown> = { updated_at: new Date() };
		if (input.name !== undefined) updates.name = input.name;
		if (input.description !== undefined) updates.description = input.description;
		await tx.update(quoteTemplates).set(updates).where(eq(quoteTemplates.id, id));

		if (input.line_items) {
			await tx
				.update(quoteTemplateLineItems)
				.set({ deleted_at: new Date(), updated_at: new Date() })
				.where(
					and(eq(quoteTemplateLineItems.template_id, id), isNull(quoteTemplateLineItems.deleted_at))
				);
			if (input.line_items.length > 0) {
				await tx.insert(quoteTemplateLineItems).values(
					input.line_items.map((li, idx) => ({
						org_id: auth.orgId,
						template_id: id,
						description: li.description,
						details: li.details?.trim() || null,
						quantity: String(li.quantity),
						unit: li.unit?.trim() || null,
						section_label: li.section_label?.trim() || null,
						is_optional: li.is_optional ?? false,
						taxable: li.taxable ?? true,
						unit_price: String(li.unit_price),
						total: computeLineTotal(li.quantity, li.unit_price),
						position: li.position ?? idx
					}))
				);
			}
		}
	});

	return json({ data: { id } });
};

export const DELETE: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canManageTemplates(auth.member)) error(403, 'Forbidden');

	const id = event.params.id!;
	const now = new Date();

	const result = await db.transaction(async (tx) => {
		const updated = await tx
			.update(quoteTemplates)
			.set({ deleted_at: now, updated_at: now })
			.where(
				and(
					eq(quoteTemplates.id, id),
					eq(quoteTemplates.org_id, auth.orgId),
					isNull(quoteTemplates.deleted_at)
				)
			)
			.returning({ id: quoteTemplates.id });
		if (updated.length === 0) throw error(404, 'Template not found');

		await tx
			.update(quoteTemplateLineItems)
			.set({ deleted_at: now, updated_at: now })
			.where(
				and(eq(quoteTemplateLineItems.template_id, id), isNull(quoteTemplateLineItems.deleted_at))
			);

		return updated[0];
	});

	if (!result) error(404, 'Template not found');
	return new Response(null, { status: 204 });
};
