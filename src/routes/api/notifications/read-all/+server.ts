import { and, eq, isNull } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { notifications } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';

export const POST: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);

	await db
		.update(notifications)
		.set({ read_at: new Date() })
		.where(
			and(
				eq(notifications.org_id, auth.orgId),
				eq(notifications.member_id, auth.member.id),
				isNull(notifications.read_at)
			)
		);

	return new Response(null, { status: 204 });
};
