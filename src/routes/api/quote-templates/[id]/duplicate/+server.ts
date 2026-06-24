import { json, error } from '@sveltejs/kit';
import { and, asc, eq, isNull } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { quoteTemplateLineItems, quoteTemplates } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canManageTemplates } from '$lib/server/quotes/permissions';

export const POST: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canManageTemplates(auth.member)) error(403, 'Forbidden');

	const sourceId = event.params.id!;

	const created = await db.transaction(async (tx) => {
		const [source] = await tx
			.select({
				id: quoteTemplates.id,
				name: quoteTemplates.name,
				description: quoteTemplates.description
			})
			.from(quoteTemplates)
			.where(
				and(
					eq(quoteTemplates.id, sourceId),
					eq(quoteTemplates.org_id, auth.orgId),
					isNull(quoteTemplates.deleted_at)
				)
			)
			.limit(1);
		if (!source) throw error(404, 'Template not found');

		const lineItems = await tx
			.select({
				description: quoteTemplateLineItems.description,
				details: quoteTemplateLineItems.details,
				quantity: quoteTemplateLineItems.quantity,
				unit: quoteTemplateLineItems.unit,
				section_label: quoteTemplateLineItems.section_label,
				is_optional: quoteTemplateLineItems.is_optional,
				unit_price: quoteTemplateLineItems.unit_price,
				total: quoteTemplateLineItems.total,
				position: quoteTemplateLineItems.position
			})
			.from(quoteTemplateLineItems)
			.where(
				and(
					eq(quoteTemplateLineItems.template_id, sourceId),
					eq(quoteTemplateLineItems.org_id, auth.orgId),
					isNull(quoteTemplateLineItems.deleted_at)
				)
			)
			.orderBy(asc(quoteTemplateLineItems.position));

		const [tpl] = await tx
			.insert(quoteTemplates)
			.values({
				org_id: auth.orgId,
				name: `${source.name} (Copy)`,
				description: source.description,
				created_by: auth.member.id
			})
			.returning();

		if (lineItems.length > 0) {
			await tx.insert(quoteTemplateLineItems).values(
				lineItems.map((li, idx) => ({
					org_id: auth.orgId,
					template_id: tpl.id,
					description: li.description,
					details: li.details,
					quantity: li.quantity,
					unit: li.unit,
					section_label: li.section_label,
					is_optional: li.is_optional,
					unit_price: li.unit_price,
					total: li.total,
					position: idx
				}))
			);
		}

		return tpl;
	});

	return json({ data: { id: created.id } }, { status: 201 });
};
