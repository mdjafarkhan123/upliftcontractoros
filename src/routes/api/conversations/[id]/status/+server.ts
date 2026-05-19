import { json } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { conversations } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';

const schema = z.object({
	status: z.enum(['open', 'closed']),
	reason: z.string().trim().max(200).optional()
});

export const PATCH: RequestHandler = async (event) => {
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
					field_errors: { status: issue?.message ?? 'Invalid status' }
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

	const set: Record<string, unknown> = {
		status: parsed.status,
		updated_at: now
	};

	if (parsed.status === 'closed') {
		set.closed_at = now;
		set.closed_by = auth.member.id;
		if (parsed.reason) set.closed_reason = parsed.reason;
		// Clear any snooze state when closing.
		set.snoozed_until = null;
		set.snoozed_by = null;
	} else {
		// Re-opening clears closed-state metadata so closed_at stays meaningful.
		set.closed_at = null;
		set.closed_by = null;
		set.closed_reason = null;
		set.snoozed_until = null;
		set.snoozed_by = null;
	}

	const [updated] = await db
		.update(conversations)
		.set(set)
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
