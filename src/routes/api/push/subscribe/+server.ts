import { json } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { pushSubscriptions } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';

const schema = z.object({
	endpoint: z.string().url(),
	p256dh: z.string().min(1),
	auth: z.string().min(1),
	user_agent: z.string().optional()
});

export const POST: RequestHandler = async (event) => {
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
		return json({ error: 'Invalid subscription data' }, { status: 400 });
	}

	// member_id and org_id always from session — never trusted from client
	await db
		.insert(pushSubscriptions)
		.values({
			org_id: auth.orgId,
			member_id: auth.member.id,
			endpoint: parsed.data.endpoint,
			p256dh: parsed.data.p256dh,
			auth: parsed.data.auth,
			user_agent: parsed.data.user_agent ?? null,
			last_seen_at: new Date()
		})
		.onConflictDoUpdate({
			target: pushSubscriptions.endpoint,
			set: {
				member_id: auth.member.id,
				org_id: auth.orgId,
				last_seen_at: new Date()
			}
		});

	return json({ data: { ok: true } });
};
