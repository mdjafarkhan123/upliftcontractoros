import { json, error } from '@sveltejs/kit';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { orgMembers, quoteTemplateLineItems, quoteTemplates } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canManageTemplates, canViewTemplates } from '$lib/server/quotes/permissions';
import { createTemplateSchema } from '$lib/server/quotes/schemas';
import { computeLineTotal } from '$lib/server/quotes/recalc';

export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canViewTemplates(auth.member)) error(403, 'Forbidden');

	const rows = await db
		.select({
			id: quoteTemplates.id,
			name: quoteTemplates.name,
			description: quoteTemplates.description,
			created_at: quoteTemplates.created_at,
			updated_at: quoteTemplates.updated_at,
			created_by_name: orgMembers.full_name,
			line_item_count: sql<number>`(SELECT COUNT(*)::int FROM quote_template_line_items WHERE template_id = ${quoteTemplates.id} AND deleted_at IS NULL)`,
			estimated_subtotal: sql<string>`COALESCE((SELECT SUM(total)::numeric(12,2) FROM quote_template_line_items WHERE template_id = ${quoteTemplates.id} AND deleted_at IS NULL), 0)::text`
		})
		.from(quoteTemplates)
		.leftJoin(orgMembers, eq(orgMembers.id, quoteTemplates.created_by))
		.where(and(eq(quoteTemplates.org_id, auth.orgId), isNull(quoteTemplates.deleted_at)))
		.orderBy(desc(quoteTemplates.updated_at));

	return json({
		items: rows.map((r) => ({
			...r,
			created_at: r.created_at.toISOString(),
			updated_at: r.updated_at.toISOString()
		}))
	});
};

export const POST: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canManageTemplates(auth.member)) error(403, 'Forbidden');

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const parsed = createTemplateSchema.safeParse(body);
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

	const created = await db.transaction(async (tx) => {
		const [tpl] = await tx
			.insert(quoteTemplates)
			.values({
				org_id: auth.orgId,
				name: input.name,
				description: input.description ?? null,
				created_by: auth.member.id
			})
			.returning();

		if (input.line_items && input.line_items.length > 0) {
			await tx.insert(quoteTemplateLineItems).values(
				input.line_items.map((li, idx) => ({
					org_id: auth.orgId,
					template_id: tpl.id,
					description: li.description,
					quantity: String(li.quantity),
					unit_price: String(li.unit_price),
					total: computeLineTotal(li.quantity, li.unit_price),
					position: li.position ?? idx
				}))
			);
		}

		return tpl;
	});

	return json({ data: { id: created.id } }, { status: 201 });
};
