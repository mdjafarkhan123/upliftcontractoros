import { json } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { conversations, orgMembers } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';

const schema = z.object({
	assigned_to: z.string().uuid().nullable()
});

export const PATCH: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!auth.member.can_send_messages) {
		return json({ error: 'Forbidden.' }, { status: 403 });
	}

	let parsed;
	try {
		const body = await event.request.json();
		const result = schema.safeParse(body);
		if (!result.success) {
			return json(
				{
					error: result.error.issues[0]?.message ?? 'Invalid input',
					field_errors: { assigned_to: result.error.issues[0]?.message ?? 'Invalid' }
				},
				{ status: 400 }
			);
		}
		parsed = result.data;
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	if (parsed.assigned_to) {
		const [member] = await db
			.select({ id: orgMembers.id })
			.from(orgMembers)
			.where(
				and(
					eq(orgMembers.id, parsed.assigned_to),
					eq(orgMembers.org_id, auth.orgId),
					eq(orgMembers.is_active, true),
					isNull(orgMembers.deleted_at)
				)
			)
			.limit(1);
		if (!member) {
			return json(
				{
					error: 'Assignee is not an active member of this organization.',
					field_errors: { assigned_to: 'Invalid assignee' }
				},
				{ status: 422 }
			);
		}
	}

	const id = event.params.id;
	const [updated] = await db
		.update(conversations)
		.set({ assigned_to: parsed.assigned_to, updated_at: new Date() })
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
