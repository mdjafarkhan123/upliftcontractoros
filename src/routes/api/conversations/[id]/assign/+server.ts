import { json } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import {
	conversations,
	internalActivityLog,
	orgMembers,
	outboxEvents
} from '$lib/server/db/schema';
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

	let assigneeName: string | null = null;
	if (parsed.assigned_to) {
		const [member] = await db
			.select({ id: orgMembers.id, full_name: orgMembers.full_name })
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
		assigneeName = member.full_name;
	}

	const id = event.params.id;
	const memberId = auth.member.id;
	const orgId = auth.orgId;

	const result = await db.transaction(async (tx) => {
		// Lock + fetch current assignee for audit
		const [current] = await tx
			.select({ assigned_to: conversations.assigned_to })
			.from(conversations)
			.where(
				and(
					eq(conversations.id, id),
					eq(conversations.org_id, orgId),
					isNull(conversations.deleted_at)
				)
			)
			.limit(1);

		if (!current) return null;

		const previousAssignedTo = current.assigned_to;

		const [updated] = await tx
			.update(conversations)
			.set({ assigned_to: parsed.assigned_to, updated_at: new Date() })
			.where(and(eq(conversations.id, id), eq(conversations.org_id, orgId)))
			.returning();

		// Audit trail (P2-B)
		await tx.insert(internalActivityLog).values({
			org_id: orgId,
			author_id: memberId,
			activity_type: 'conversation.assigned',
			title: parsed.assigned_to ? `Assigned to ${assigneeName}` : 'Unassigned',
			metadata: {
				conversation_id: id,
				assigned_to: parsed.assigned_to,
				previous_assigned_to: previousAssignedTo
			}
		});

		// Outbox event — only fire if assignee actually changed
		if (parsed.assigned_to && parsed.assigned_to !== previousAssignedTo) {
			await tx.insert(outboxEvents).values({
				org_id: orgId,
				event_type: 'conversation.assigned',
				resource_type: 'conversation',
				resource_id: id,
				payload: {
					conversation_id: id,
					assigned_to: parsed.assigned_to,
					assigned_by: memberId,
					previous_assigned_to: previousAssignedTo
				},
				idempotency_key: `conv-assigned:${id}:${parsed.assigned_to}:${Date.now()}`
			});
		}

		return updated;
	});

	if (!result) return json({ error: 'Conversation not found.' }, { status: 404 });
	return json({ data: { conversation: result } });
};
