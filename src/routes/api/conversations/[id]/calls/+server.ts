import { json } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { conversations, outboxEvents } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { createLogger } from '$lib/server/log';
import { recordOutboundMessage } from '$lib/server/conversations';
import { touchContactLastContacted } from '$lib/server/contacts/touchLastContacted';

const log = createLogger('inbox.call.log');

// 8 hours — a generous upper bound that still rejects obviously-bad input.
const MAX_CALL_DURATION_SECONDS = 8 * 60 * 60;

const logCallSchema = z.object({
	outcome: z.enum(['spoke', 'voicemail', 'no_answer', 'follow_up_scheduled', 'wrong_number']),
	duration_seconds: z.number().int().nonnegative().max(MAX_CALL_DURATION_SECONDS).optional(),
	body: z.string().trim().max(2000).optional()
});

function canAccess(
	conv: { assigned_to: string | null },
	member: {
		id: string;
		can_view_all_conversations: boolean;
		can_view_assigned_conversations: boolean;
	}
): boolean {
	if (member.can_view_all_conversations) return true;
	if (member.can_view_assigned_conversations && conv.assigned_to === member.id) return true;
	return false;
}

/**
 * Log a manually-placed phone call into the conversation timeline. The
 * contractor called from their native dialer (a `tel:` tap), so there is no
 * transport — but the log IS a business event. Stored as a `messages` row
 * (channel `call`, direction `outbound`, status `sent`) and accompanied by a
 * `call.logged` outbox event so the pipeline can ratchet-advance on a `spoke`
 * outcome (Stage 3.a). Mutation + outbox live in one transaction (Rule #8).
 */
export const POST: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!auth.member.can_send_messages) {
		return json({ error: 'You do not have permission to log calls.' }, { status: 403 });
	}

	const conversationId = event.params.id;
	let parsed: z.infer<typeof logCallSchema>;
	try {
		const raw = await event.request.json();
		const result = logCallSchema.safeParse(raw);
		if (!result.success) {
			const issue = result.error.issues[0];
			const field = String(issue?.path?.[0] ?? '');
			return json(
				{
					error: issue?.message ?? 'Invalid input',
					field_errors: field ? { [field]: issue.message } : undefined
				},
				{ status: 400 }
			);
		}
		parsed = result.data;
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const [conv] = await db
		.select()
		.from(conversations)
		.where(
			and(
				eq(conversations.id, conversationId),
				eq(conversations.org_id, auth.orgId),
				isNull(conversations.deleted_at)
			)
		)
		.limit(1);
	if (!conv) return json({ error: 'Conversation not found.' }, { status: 404 });
	if (!canAccess(conv, auth.member)) return json({ error: 'Forbidden.' }, { status: 403 });

	try {
		const inserted = await db.transaction(async (tx) => {
			const row = await recordOutboundMessage(tx, {
				orgId: auth.orgId,
				conversationId: conv.id,
				channel: 'call',
				body: parsed.body?.trim() || null,
				sentBy: auth.member.id,
				status: 'sent',
				source: 'manual_call_log',
				callOutcome: parsed.outcome,
				callDurationSeconds: parsed.duration_seconds ?? null
			});

			// Emit the business event in the same tx. The pipeline auto-advance worker
			// only acts on outcome=spoke, but we emit for every outcome so future
			// consumers (and the timeline/audit) see the full call history.
			await tx.insert(outboxEvents).values({
				org_id: auth.orgId,
				event_type: 'call.logged',
				resource_type: 'message',
				resource_id: row.id,
				payload: {
					message_id: row.id,
					conversation_id: conv.id,
					contact_id: conv.contact_id,
					org_id: auth.orgId,
					outcome: parsed.outcome,
					logged_at: new Date().toISOString()
				},
				idempotency_key: `call.logged:${row.id}`
			});

			// A logged call is an outbound touch — reopen a closed/snoozed thread so
			// the timeline stays consistent (mirrors the message-send behaviour).
			if (conv.status !== 'open') {
				await tx
					.update(conversations)
					.set({
						status: 'open',
						snoozed_until: null,
						snoozed_by: null,
						closed_at: null,
						closed_by: null,
						closed_reason: null,
						updated_at: new Date()
					})
					.where(eq(conversations.id, conv.id));
			}

			return row;
		});

		void touchContactLastContacted(auth.orgId, conv.contact_id);
		return json({ data: { message: inserted } }, { status: 201 });
	} catch (e) {
		log.error({
			phase: 'tx_error',
			conversation_id: conv.id,
			org_id: auth.orgId,
			error: e instanceof Error ? e.message : String(e),
			stack: e instanceof Error ? e.stack : undefined
		});
		return json({ error: 'Failed to log call.' }, { status: 500 });
	}
};
