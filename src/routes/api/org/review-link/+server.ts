import { json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { automationSettings } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';

/**
 * Returns the org's public Google review link (stored on automation_settings).
 * Read-only and harmless — it's a public URL — so any active member may read it.
 * Used by the Before/After share dialog's "Add review link" insert.
 */
export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);

	const [row] = await db
		.select({ google_review_link: automationSettings.google_review_link })
		.from(automationSettings)
		.where(eq(automationSettings.org_id, auth.orgId))
		.limit(1);

	return json({ data: { google_review_link: row?.google_review_link ?? null } });
};
