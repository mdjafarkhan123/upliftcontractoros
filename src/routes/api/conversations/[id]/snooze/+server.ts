import { json } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { conversations } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';

const PRESETS = ['1h', '3h', 'tomorrow_9am', 'next_week'] as const;
type Preset = (typeof PRESETS)[number];

const schema = z.object({
	preset: z.enum(PRESETS)
});

function computeSnoozedUntil(preset: Preset, now: Date): Date {
	const next = new Date(now);
	switch (preset) {
		case '1h':
			next.setHours(next.getHours() + 1);
			return next;
		case '3h':
			next.setHours(next.getHours() + 3);
			return next;
		case 'tomorrow_9am': {
			next.setDate(next.getDate() + 1);
			next.setHours(9, 0, 0, 0);
			return next;
		}
		case 'next_week': {
			next.setDate(next.getDate() + 7);
			next.setHours(9, 0, 0, 0);
			return next;
		}
	}
}

export const POST: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!auth.member.can_send_messages) {
		return json({ error: 'Forbidden.' }, { status: 403 });
	}

	let parsed: z.infer<typeof schema>;
	try {
		const body = await event.request.json();
		const result = schema.safeParse(body);
		if (!result.success) {
			const issue = result.error.issues[0];
			return json(
				{
					error: issue?.message ?? 'Invalid input',
					field_errors: { preset: issue?.message ?? 'Invalid preset' }
				},
				{ status: 400 }
			);
		}
		parsed = result.data;
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const id = event.params.id;
	const now = new Date();
	const snoozedUntil = computeSnoozedUntil(parsed.preset, now);

	const [updated] = await db
		.update(conversations)
		.set({
			status: 'snoozed',
			snoozed_until: snoozedUntil,
			snoozed_by: auth.member.id,
			updated_at: now
		})
		.where(
			and(
				eq(conversations.id, id),
				eq(conversations.org_id, auth.orgId),
				isNull(conversations.deleted_at)
			)
		)
		.returning();

	if (!updated) return json({ error: 'Conversation not found.' }, { status: 404 });
	return json({ data: { conversation: updated } });
};

export const DELETE: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!auth.member.can_send_messages) {
		return json({ error: 'Forbidden.' }, { status: 403 });
	}

	const id = event.params.id;
	const [updated] = await db
		.update(conversations)
		.set({
			status: 'open',
			snoozed_until: null,
			snoozed_by: null,
			updated_at: new Date()
		})
		.where(
			and(
				eq(conversations.id, id),
				eq(conversations.org_id, auth.orgId),
				eq(conversations.status, 'snoozed'),
				isNull(conversations.deleted_at)
			)
		)
		.returning();

	if (!updated) return json({ error: 'Conversation is not snoozed.' }, { status: 404 });
	return json({ data: { conversation: updated } });
};
