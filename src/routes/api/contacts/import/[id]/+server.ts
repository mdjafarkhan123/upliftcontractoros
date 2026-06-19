import { json, error } from '@sveltejs/kit';
import { and, eq, inArray } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { contactImports } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';

// Realtime is the primary progress transport; this GET is the polling fallback
// and the refresh-resume source (modal re-queries the row on open).
export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);

	const [imp] = await db
		.select()
		.from(contactImports)
		.where(and(eq(contactImports.id, event.params.id), eq(contactImports.org_id, auth.orgId)))
		.limit(1);

	if (!imp) error(404, 'Import not found');

	return json({ data: imp });
};

// Request cancellation. The worker checks status between batches and stops,
// setting 'cancelled'. Only an in-flight import (pending/processing) can be
// cancelled; a terminal import is returned unchanged.
export const PATCH: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!auth.member.can_create_contacts) error(403, 'Forbidden');

	const [updated] = await db
		.update(contactImports)
		.set({ status: 'cancelling', updated_at: new Date() })
		.where(
			and(
				eq(contactImports.id, event.params.id),
				eq(contactImports.org_id, auth.orgId),
				inArray(contactImports.status, ['pending', 'processing'])
			)
		)
		.returning();

	if (updated) return json({ data: updated });

	// Not updated: either it doesn't exist for this org, or it's already terminal.
	const [imp] = await db
		.select()
		.from(contactImports)
		.where(and(eq(contactImports.id, event.params.id), eq(contactImports.org_id, auth.orgId)))
		.limit(1);

	if (!imp) error(404, 'Import not found');
	return json({ data: imp });
};
