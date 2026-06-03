import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { pushSubscriptions } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';

const schema = z.object({
	endpoint: z.string().url()
});

export const DELETE: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Invalid JSON' }, { status: 400 });
	}

	const parsed = schema.safeParse(body);
	if (!parsed.success) {
		return json({ error: 'Invalid request' }, { status: 400 });
	}

	// Scope by member_id so a member can only delete their own subscriptions
	await db
		.delete(pushSubscriptions)
		.where(
			and(
				eq(pushSubscriptions.endpoint, parsed.data.endpoint),
				eq(pushSubscriptions.member_id, auth.member.id)
			)
		);

	return new Response(null, { status: 204 });
};
