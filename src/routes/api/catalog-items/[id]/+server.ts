import { json, error } from '@sveltejs/kit';
import { and, eq, isNull, ne, sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { catalogItems } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canManageCatalog } from '$lib/server/quotes/permissions';
import { canViewCostMargin } from '$lib/server/finance/permissions';
import { updateCatalogItemSchema } from '$lib/server/quotes/schemas';

export const PATCH: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canManageCatalog(auth.member)) error(403, 'Forbidden');

	const id = event.params.id!;

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const parsed = updateCatalogItemSchema.safeParse(body);
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

	// Renaming onto another live item's name is a duplicate — block it.
	if (input.name !== undefined) {
		const [dupe] = await db
			.select({ id: catalogItems.id })
			.from(catalogItems)
			.where(
				and(
					eq(catalogItems.org_id, auth.orgId),
					isNull(catalogItems.deleted_at),
					ne(catalogItems.id, id),
					sql`lower(${catalogItems.name}) = lower(${input.name})`
				)
			)
			.limit(1);
		if (dupe) {
			return json(
				{ error: 'Another item already uses this name', field_errors: { name: 'Already in use' } },
				{ status: 409 }
			);
		}
	}

	const updates: Record<string, unknown> = { updated_at: new Date() };
	if (input.name !== undefined) updates.name = input.name;
	if (input.description !== undefined) updates.description = input.description;
	if (input.unit_price !== undefined) updates.unit_price = String(input.unit_price);
	if (input.unit !== undefined) updates.unit = input.unit?.trim() || null;
	// Cost edits are ignored for members without revenue access (they never see the field,
	// so their save would otherwise blank the owner's cost). The existing value is left intact.
	if (input.unit_cost !== undefined && canViewCostMargin(auth.member))
		updates.unit_cost = input.unit_cost === null ? null : String(input.unit_cost);
	if (input.default_taxable !== undefined) updates.default_taxable = input.default_taxable;
	if (input.category !== undefined) updates.category = input.category?.trim() || null;
	if (input.image_url !== undefined) updates.image_url = input.image_url ?? null;

	const result = await db
		.update(catalogItems)
		.set(updates)
		.where(
			and(
				eq(catalogItems.id, id),
				eq(catalogItems.org_id, auth.orgId),
				isNull(catalogItems.deleted_at)
			)
		)
		.returning({ id: catalogItems.id });

	if (result.length === 0) error(404, 'Catalog item not found');
	return json({ data: { id: result[0].id } });
};

// Archive (soft delete). Quotes already hold their own snapshot, so this never
// touches any existing quote — it just removes the item from the picker.
export const DELETE: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canManageCatalog(auth.member)) error(403, 'Forbidden');

	const id = event.params.id!;
	const result = await db
		.update(catalogItems)
		.set({ deleted_at: new Date(), updated_at: new Date() })
		.where(
			and(
				eq(catalogItems.id, id),
				eq(catalogItems.org_id, auth.orgId),
				isNull(catalogItems.deleted_at)
			)
		)
		.returning({ id: catalogItems.id });

	if (result.length === 0) error(404, 'Catalog item not found');
	return new Response(null, { status: 204 });
};
