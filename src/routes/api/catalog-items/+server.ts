import { json, error } from '@sveltejs/kit';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { catalogItems } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canCreateCatalogItem, canViewCatalog } from '$lib/server/quotes/permissions';
import { canViewCostMargin } from '$lib/server/finance/permissions';
import { createCatalogItemSchema } from '$lib/server/quotes/schemas';
import { resolveLogoUrl } from '$lib/server/media/resolveLogo';

// List the org's active (non-archived) catalog items. The whole list is small, so
// the client caches it once and filters/searches in-memory for instant results.
export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canViewCatalog(auth.member)) error(403, 'Forbidden');

	// Cost is private: only members with revenue access receive it (others get null).
	const canCost = canViewCostMargin(auth.member);

	const rows = await db
		.select({
			id: catalogItems.id,
			name: catalogItems.name,
			description: catalogItems.description,
			unit_price: catalogItems.unit_price,
			unit: catalogItems.unit,
			unit_cost: catalogItems.unit_cost,
			default_taxable: catalogItems.default_taxable,
			category: catalogItems.category,
			image_url: catalogItems.image_url,
			created_at: catalogItems.created_at,
			updated_at: catalogItems.updated_at
		})
		.from(catalogItems)
		.where(and(eq(catalogItems.org_id, auth.orgId), isNull(catalogItems.deleted_at)))
		.orderBy(asc(catalogItems.name));

	const items = await Promise.all(
		rows.map(async (r) => ({
			...r,
			unit_cost: canCost ? r.unit_cost : null,
			image_url: await resolveLogoUrl(r.image_url),
			created_at: r.created_at.toISOString(),
			updated_at: r.updated_at.toISOString()
		}))
	);

	return json({ items });
};

export const POST: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canCreateCatalogItem(auth.member)) error(403, 'Forbidden');

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const parsed = createCatalogItemSchema.safeParse(body);
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

	// Duplicate guard (case-insensitive name) so the catalog doesn't rot with near-dupes.
	// On a hit, return 409 with the existing id so the UI can offer update vs save-as-new.
	if (!input.force) {
		const [dupe] = await db
			.select({ id: catalogItems.id })
			.from(catalogItems)
			.where(
				and(
					eq(catalogItems.org_id, auth.orgId),
					isNull(catalogItems.deleted_at),
					sql`lower(${catalogItems.name}) = lower(${input.name})`
				)
			)
			.limit(1);
		if (dupe) {
			return json(
				{ error: 'An item with this name already exists', data: { existing_item_id: dupe.id } },
				{ status: 409 }
			);
		}
	}

	const [created] = await db
		.insert(catalogItems)
		.values({
			org_id: auth.orgId,
			name: input.name,
			description: input.description ?? null,
			unit_price: String(input.unit_price),
			unit: input.unit?.trim() || null,
			unit_cost:
				input.unit_cost !== undefined && input.unit_cost !== null ? String(input.unit_cost) : null,
			default_taxable: input.default_taxable ?? true,
			category: input.category?.trim() || null,
			image_url: input.image_url ?? null,
			created_by: auth.member.id
		})
		.returning({ id: catalogItems.id });

	return json({ data: { id: created.id } }, { status: 201 });
};
