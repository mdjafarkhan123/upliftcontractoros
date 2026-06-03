import { json } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { quickReplies } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';

const CHANNELS = ['sms', 'email', 'webchat', 'any'] as const;

const patchSchema = z.object({
	title: z.string().trim().min(1).max(60).optional(),
	body: z.string().trim().min(1).max(1000).optional(),
	channel: z.enum(CHANNELS).optional(),
	sort_order: z.number().int().nonnegative().optional()
});

export const PATCH: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);

	let parsed;
	try {
		const body = await event.request.json();
		const result = patchSchema.safeParse(body);
		if (!result.success) {
			const first = result.error.issues[0];
			return json(
				{
					error: first?.message ?? 'Invalid input',
					field_errors: first ? { [String(first.path[0] ?? 'title')]: first.message } : undefined
				},
				{ status: 400 }
			);
		}
		parsed = result.data;
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const id = event.params.id;

	try {
		const [updated] = await db
			.update(quickReplies)
			.set({ ...parsed, updated_at: new Date() })
			.where(and(eq(quickReplies.id, id), eq(quickReplies.org_id, auth.orgId)))
			.returning();
		if (!updated) return json({ error: 'Quick reply not found.' }, { status: 404 });
		return json({ data: { quick_reply: updated } });
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		if (msg.includes('quick_replies_org_title_unique')) {
			return json(
				{
					error: 'A quick reply with that title already exists.',
					field_errors: { title: 'Title must be unique' }
				},
				{ status: 409 }
			);
		}
		throw e;
	}
};

export const DELETE: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);

	const id = event.params.id;
	const [updated] = await db
		.update(quickReplies)
		.set({ is_archived: true, updated_at: new Date() })
		.where(and(eq(quickReplies.id, id), eq(quickReplies.org_id, auth.orgId)))
		.returning({ id: quickReplies.id });

	if (!updated) return json({ error: 'Quick reply not found.' }, { status: 404 });
	return new Response(null, { status: 204 });
};
