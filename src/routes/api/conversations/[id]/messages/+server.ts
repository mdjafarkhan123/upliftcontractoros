import { json, error } from '@sveltejs/kit';
import { and, asc, eq, isNull, lt } from 'drizzle-orm';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import {
	contacts,
	conversations,
	messages,
	organizations,
	outboxEvents
} from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { twilio } from '$lib/server/twilio/client';
import { isReleasedPhone } from '$lib/utils/phone';
import { createLogger } from '$lib/server/log';

const log = createLogger('inbox.message.insert');

const PAGE_SIZE = 50;

const sendSchema = z.object({
	body: z.string().min(1, 'Message body is required').max(1600, 'Message too long'),
	is_internal_note: z.boolean().optional().default(false)
});

function canAccess(
	conv: { assigned_to: string | null },
	member: { id: string; can_view_all_conversations: boolean; can_view_assigned_conversations: boolean }
): boolean {
	if (member.can_view_all_conversations) return true;
	if (member.can_view_assigned_conversations && conv.assigned_to === member.id) return true;
	return false;
}

export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);

	const conversationId = event.params.id;
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
	if (!conv) error(404, 'Conversation not found');
	if (!canAccess(conv, auth.member)) error(403, 'Forbidden');

	const cursor = event.url.searchParams.get('cursor');
	const conditions = [eq(messages.conversation_id, conversationId)];
	if (cursor) {
		const [createdAt, id] = cursor.split('|');
		if (createdAt && id) {
			conditions.push(lt(messages.created_at, new Date(createdAt)));
		}
	}

	const rows = await db
		.select()
		.from(messages)
		.where(and(...conditions))
		.orderBy(asc(messages.created_at), asc(messages.id))
		.limit(PAGE_SIZE + 1);

	const hasMore = rows.length > PAGE_SIZE;
	const items = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
	const last = items[items.length - 1];
	const nextCursor = hasMore && last ? `${last.created_at.toISOString()}|${last.id}` : null;

	return json({ data: { items, next_cursor: nextCursor } });
};

export const POST: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!auth.member.can_send_messages) {
		return json({ error: 'You do not have permission to send messages.' }, { status: 403 });
	}

	const conversationId = event.params.id;
	let parsed;
	try {
		const body = await event.request.json();
		const result = sendSchema.safeParse(body);
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

	const [contact] = await db
		.select()
		.from(contacts)
		.where(and(eq(contacts.id, conv.contact_id), eq(contacts.org_id, auth.orgId)))
		.limit(1);
	if (!contact) return json({ error: 'Contact not found.' }, { status: 404 });

	// Webchat channel — no Twilio, just insert outbound message and emit message.sent
	if (conv.channel === 'webchat') {
		const txStart = Date.now();
		try {
			const result = await db.transaction(async (tx) => {
				const [inserted] = await tx
					.insert(messages)
					.values({
						org_id: auth.orgId,
						conversation_id: conv.id,
						direction: 'outbound',
						channel: 'webchat',
						body: parsed.body,
						is_internal_note: false,
						status: 'sent',
						sent_by: auth.member.id,
						sent_at: new Date()
					})
					.returning();

				await tx
					.update(conversations)
					.set({ last_message_at: new Date(), updated_at: new Date() })
					.where(eq(conversations.id, conv.id));

				await tx.insert(outboxEvents).values({
					org_id: auth.orgId,
					event_type: 'message.sent',
					resource_type: 'message',
					resource_id: inserted.id,
					payload: {
						message_id: inserted.id,
						conversation_id: conv.id,
						contact_id: contact.id,
						org_id: auth.orgId,
						channel: 'webchat',
						body: parsed.body,
						sent_by: auth.member.id
					},
					idempotency_key: `message.sent:${inserted.id}`
				});

				return inserted;
			});
			return json({ data: { message: result } }, { status: 201 });
		} catch (e) {
			log.error({
				phase: 'tx_error',
				channel: 'webchat',
				conversation_id: conv.id,
				org_id: auth.orgId,
				ms: Date.now() - txStart,
				error: e instanceof Error ? e.message : String(e),
				stack: e instanceof Error ? e.stack : undefined
			});
			return json({ error: 'Failed to send message.' }, { status: 500 });
		}
	}

	// Internal notes — never touch Twilio, never emit message.sent, excluded from unread
	if (parsed.is_internal_note) {
		const [inserted] = await db
			.insert(messages)
			.values({
				org_id: auth.orgId,
				conversation_id: conv.id,
				direction: 'outbound',
				channel: 'sms',
				body: parsed.body,
				is_internal_note: true,
				status: 'sent',
				sent_by: auth.member.id,
				sent_at: new Date()
			})
			.returning();
		await db
			.update(conversations)
			.set({ last_message_at: new Date(), updated_at: new Date() })
			.where(eq(conversations.id, conv.id));
		return json({ data: { message: inserted } }, { status: 201 });
	}

	// Outbound SMS path
	if (contact.sms_opt_out) {
		return json({ error: 'Contact has opted out of SMS.' }, { status: 400 });
	}
	if (isReleasedPhone(contact.phone)) {
		return json({ error: 'Contact phone number has been released.' }, { status: 400 });
	}

	const [org] = await db
		.select({ twilio_phone_number: organizations.twilio_phone_number })
		.from(organizations)
		.where(eq(organizations.id, auth.orgId))
		.limit(1);
	if (!org?.twilio_phone_number) {
		return json({ error: 'Organization is not configured for SMS.' }, { status: 400 });
	}

	let twilioSid: string;
	try {
		const sent = await twilio().messages.create({
			from: org.twilio_phone_number,
			to: contact.phone,
			body: parsed.body
		});
		twilioSid = sent.sid;
	} catch (e) {
		const msg = e instanceof Error ? e.message : 'Failed to send SMS';
		console.error('[outbound sms] twilio error', e);
		return json({ error: msg }, { status: 502 });
	}

	const txStart = Date.now();
	try {
		const result = await db.transaction(async (tx) => {
			const [inserted] = await tx
				.insert(messages)
				.values({
					org_id: auth.orgId,
					conversation_id: conv.id,
					direction: 'outbound',
					channel: 'sms',
					body: parsed.body,
					is_internal_note: false,
					status: 'sent',
					twilio_message_sid: twilioSid,
					sent_by: auth.member.id,
					sent_at: new Date()
				})
				.returning();

			await tx
				.update(conversations)
				.set({ last_message_at: new Date(), updated_at: new Date() })
				.where(eq(conversations.id, conv.id));

			await tx.insert(outboxEvents).values({
				org_id: auth.orgId,
				event_type: 'message.sent',
				resource_type: 'message',
				resource_id: inserted.id,
				payload: {
					message_id: inserted.id,
					conversation_id: conv.id,
					contact_id: contact.id,
					org_id: auth.orgId,
					channel: 'sms',
					body: parsed.body,
					twilio_message_sid: twilioSid,
					sent_by: auth.member.id
				},
				idempotency_key: `message.sent:${inserted.id}`
			});

			return inserted;
		});
		return json({ data: { message: result } }, { status: 201 });
	} catch (e) {
		log.error({
			phase: 'tx_error',
			channel: 'sms',
			conversation_id: conv.id,
			org_id: auth.orgId,
			ms: Date.now() - txStart,
			twilio_message_sid: twilioSid,
			error: e instanceof Error ? e.message : String(e),
			stack: e instanceof Error ? e.stack : undefined
		});
		console.error('[outbound sms] db write failed after twilio send', e);
		// Twilio already sent. Persist a best-effort row so the message isn't lost.
		try {
			const [salvage] = await db
				.insert(messages)
				.values({
					org_id: auth.orgId,
					conversation_id: conv.id,
					direction: 'outbound',
					channel: 'sms',
					body: parsed.body,
					is_internal_note: false,
					status: 'sent',
					twilio_message_sid: twilioSid,
					sent_by: auth.member.id,
					sent_at: new Date()
				})
				.returning();
			return json({ data: { message: salvage } }, { status: 201 });
		} catch {
			return json({ error: 'Message sent but failed to persist.' }, { status: 500 });
		}
	}
};

