import { json, error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { getContractorSession } from '$lib/server/auth/session';
import { db } from '$lib/server/db/client';
import { organizations } from '$lib/server/db/schema';

export const GET: RequestHandler = async (event) => {
	const session = await getContractorSession(event);
	if (!session) throw error(401, 'Unauthorized');

	const [org] = await db
		.select({
			id: organizations.id,
			name: organizations.name,
			slug: organizations.slug,
			logo_url: organizations.logo_url,
			primary_color: organizations.primary_color,
			status: organizations.status,
			is_setup_complete: organizations.is_setup_complete,
			timezone: organizations.timezone
		})
		.from(organizations)
		.where(eq(organizations.id, session.orgId))
		.limit(1);

	if (!org) throw error(404, 'Organization not found');

	return json({ org, member: session.member });
};
