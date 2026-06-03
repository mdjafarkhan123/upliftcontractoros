import { json } from '@sveltejs/kit';
import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { quickReplies } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';

const CHANNELS = ['sms', 'email', 'webchat', 'any'] as const;

const createSchema = z.object({
	title: z.string().trim().min(1, 'Title is required').max(60, 'Max 60 characters'),
	body: z.string().trim().min(1, 'Body is required').max(1000, 'Max 1000 characters'),
	channel: z.enum(CHANNELS).default('any'),
	sort_order: z.number().int().nonnegative().default(0)
});

export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);

	const items = await db
		.select()
		.from(quickReplies)
		.where(and(eq(quickReplies.org_id, auth.orgId), eq(quickReplies.is_archived, false)))
		.orderBy(asc(quickReplies.sort_order), asc(quickReplies.created_at));

	return json({ data: { items } });
};

export const POST: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);

	let parsed;
	try {
		const body = await event.request.json();
		const result = createSchema.safeParse(body);
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

	try {
		const [row] = await db
			.insert(quickReplies)
			.values({
				org_id: auth.orgId,
				created_by: auth.member.id,
				title: parsed.title,
				body: parsed.body,
				channel: parsed.channel,
				sort_order: parsed.sort_order
			})
			.returning();
		return json({ data: { quick_reply: row } }, { status: 201 });
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
