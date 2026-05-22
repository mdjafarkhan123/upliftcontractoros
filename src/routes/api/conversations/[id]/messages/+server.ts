import { json, error } from '@sveltejs/kit';
import { and, asc, desc, eq, isNull, isNotNull, lt } from 'drizzle-orm';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import {
	contacts,
	conversations,
	media,
	messages,
	organizations,
	outboxEvents,
	webchatSessions
} from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { isReleasedPhone } from '$lib/utils/phone';
import { createLogger } from '$lib/server/log';
import { touchContactLastContacted } from '$lib/server/contacts/touchLastContacted';
import { recordOutboundMessage, type OutboundChannel } from '$lib/server/conversations';
import { ensureReplyAlias } from '$lib/server/email/replyAlias';
import { getCurrentUsage } from '$lib/server/usage/assertAndIncrementUsage';

const log = createLogger('inbox.message.insert');

const PAGE_SIZE = 50;
const MAX_ATTACHMENT_BYTES_TOTAL = 20 * 1024 * 1024;

const attachmentSchema = z.object({
	filename: z.string().min(1).max(255),
	r2_key: z.string().min(1).max(500),
	mime_type: z.string().min(1).max(127),
	size_bytes: z.number().int().nonnegative().max(MAX_ATTACHMENT_BYTES_TOTAL),
	sha256: z.string().regex(/^[a-f0-9]{64}$/i)
});

const sendSchema = z.object({
	body: z.string().min(1, 'Message body is required').max(10_000, 'Message too long'),
	channel: z.enum(['sms', 'webchat', 'email']).optional(),
	email_subject: z.string().trim().max(255).optional(),
	is_internal_note: z.boolean().optional().default(false),
	attachments: z.array(attachmentSchema).max(10).optional()
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

async function resolveOutboundChannel(
	conversationId: string,
	requested: OutboundChannel | undefined
): Promise<OutboundChannel> {
	if (requested) return requested;
	const [session] = await db
		.select({ id: webchatSessions.id })
		.from(webchatSessions)
		.where(eq(webchatSessions.conversation_id, conversationId))
		.limit(1);
	return session ? 'webchat' : 'sms';
}

export const POST: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!auth.member.can_send_messages) {
		return json({ error: 'You do not have permission to send messages.' }, { status: 403 });
	}

	const conversationId = event.params.id;
	let parsed: z.infer<typeof sendSchema>;
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

	// Internal notes — no transport, no outbox emit.
	if (parsed.is_internal_note) {
		const inheritedChannel = conv.last_message_channel ?? 'sms';
		const inserted = await recordOutboundMessage(db, {
			orgId: auth.orgId,
			conversationId: conv.id,
			channel: inheritedChannel,
			body: parsed.body,
			sentBy: auth.member.id,
			isInternalNote: true,
			source: 'api'
		});
		return json({ data: { message: inserted } }, { status: 201 });
	}

	const outboundChannel = await resolveOutboundChannel(conv.id, parsed.channel);

	// ── Email branch (async via outbox → email worker) ───────────────────────
	if (outboundChannel === 'email') {
		if (!contact.email) {
			return json(
				{ error: 'Contact does not have an email address.', field_errors: { channel: 'No email on file' } },
				{ status: 400 }
			);
		}

		// Find newest email in the thread for subject + threading headers.
		const [lastEmail] = await db
			.select({
				id: messages.id,
				email_subject: messages.email_subject,
				email_provider_message_id: messages.email_provider_message_id,
				email_references: messages.email_references
			})
			.from(messages)
			.where(
				and(
					eq(messages.conversation_id, conv.id),
					eq(messages.channel, 'email'),
					isNotNull(messages.email_provider_message_id)
				)
			)
			.orderBy(desc(messages.created_at))
			.limit(1);

		let subject = parsed.email_subject?.trim() ?? '';
		if (!subject) {
			if (lastEmail?.email_subject) {
				subject = lastEmail.email_subject.startsWith('Re:')
					? lastEmail.email_subject
					: `Re: ${lastEmail.email_subject}`;
			} else if (conv.subject) {
				subject = conv.subject;
			} else {
				return json(
					{
						error: 'A subject is required for the first email.',
						field_errors: { email_subject: 'Subject is required' }
					},
					{ status: 400 }
				);
			}
		}

		const inReplyTo = lastEmail?.email_provider_message_id ?? null;
		const references = lastEmail
			? [lastEmail.email_references, lastEmail.email_provider_message_id]
					.filter(Boolean)
					.join(' ')
					.trim() || null
			: null;

		// Reserve an opaque reply alias before the tx so the worker has it ready.
		await ensureReplyAlias(auth.orgId, conv.id);

		// Cap total attachment bytes early.
		const totalBytes = (parsed.attachments ?? []).reduce((s, a) => s + a.size_bytes, 0);
		if (totalBytes > MAX_ATTACHMENT_BYTES_TOTAL) {
			return json(
				{
					error: 'Attachments exceed the 20 MB limit.',
					field_errors: { attachments: 'Total attachment size too large' }
				},
				{ status: 400 }
			);
		}

		const txStart = Date.now();
		try {
			const result = await db.transaction(async (tx) => {
				const inserted = await recordOutboundMessage(tx, {
					orgId: auth.orgId,
					conversationId: conv.id,
					channel: 'email',
					body: parsed.body,
					sentBy: auth.member.id,
					status: 'queued',
					source: 'api',
					emailMeta: {
						email_subject: subject,
						email_to_addresses: [contact.email!],
						email_in_reply_to: inReplyTo ?? undefined,
						email_references: references ?? undefined
					}
				});

				if (parsed.attachments && parsed.attachments.length > 0) {
					await tx.insert(media).values(
						parsed.attachments.map((a) => ({
							org_id: auth.orgId,
							uploaded_by: auth.member.id,
							message_id: inserted.id,
							r2_key: a.r2_key,
							original_filename: a.filename,
							file_size_bytes: a.size_bytes,
							media_type: 'attachment' as const,
							mime_type: a.mime_type,
							purpose_tag: 'quote_attachment' as const, // reused enum value; revisit when we add an 'email_attachment' tag
							scan_status: 'pending',
							sha256_hash: a.sha256
						}))
					);
				}

				await tx.insert(outboxEvents).values({
					org_id: auth.orgId,
					event_type: 'email.send.requested',
					resource_type: 'message',
					resource_id: inserted.id,
					payload: {
						message_id: inserted.id,
						conversation_id: conv.id,
						contact_id: contact.id,
						org_id: auth.orgId
					},
					idempotency_key: `email.send.requested:${inserted.id}`
				});

				return inserted;
			});
			void touchContactLastContacted(auth.orgId, contact.id);
			return json({ data: { message: result } }, { status: 201 });
		} catch (e) {
			log.error({
				phase: 'tx_error',
				channel: 'email',
				conversation_id: conv.id,
				org_id: auth.orgId,
				ms: Date.now() - txStart,
				error: e instanceof Error ? e.message : String(e)
			});
			return json({ error: 'Failed to queue email.' }, { status: 500 });
		}
	}

	// ── Webchat branch ───────────────────────────────────────────────────────
	if (outboundChannel === 'webchat') {
		const txStart = Date.now();
		try {
			const result = await db.transaction(async (tx) => {
				const inserted = await recordOutboundMessage(tx, {
					orgId: auth.orgId,
					conversationId: conv.id,
					channel: 'webchat',
					body: parsed.body,
					sentBy: auth.member.id,
					source: 'api'
				});

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

	// ── SMS branch (async via outbox → SMS worker) ──────────────────────────
	if (contact.sms_opt_out) {
		return json({ error: 'Contact has opted out of SMS.' }, { status: 400 });
	}
	if (isReleasedPhone(contact.phone)) {
		return json({ error: 'Contact phone number has been released.' }, { status: 400 });
	}

	const [org] = await db
		.select({
			twilio_phone_number: organizations.twilio_phone_number,
			max_monthly_sms: organizations.max_monthly_sms
		})
		.from(organizations)
		.where(eq(organizations.id, auth.orgId))
		.limit(1);
	if (!org?.twilio_phone_number) {
		return json({ error: 'Organization is not configured for SMS.' }, { status: 400 });
	}

	// Soft pre-flight: surface plan-limit rejections immediately so the UI
	// doesn't enqueue a doomed send. Authoritative atomic check still runs
	// in the SMS worker just before Twilio is called.
	const smsUsed = await getCurrentUsage(db, auth.orgId, 'sms_sent');
	if (smsUsed >= org.max_monthly_sms) {
		return json(
			{ error: `Monthly SMS limit reached (${org.max_monthly_sms}). Upgrade your plan to send more.` },
			{ status: 403 }
		);
	}

	const txStart = Date.now();
	try {
		const result = await db.transaction(async (tx) => {
			const inserted = await recordOutboundMessage(tx, {
				orgId: auth.orgId,
				conversationId: conv.id,
				channel: 'sms',
				body: parsed.body,
				sentBy: auth.member.id,
				status: 'queued',
				source: 'api'
			});

			await tx.insert(outboxEvents).values({
				org_id: auth.orgId,
				event_type: 'sms.send.requested',
				resource_type: 'message',
				resource_id: inserted.id,
				payload: {
					message_id: inserted.id,
					conversation_id: conv.id,
					contact_id: contact.id,
					org_id: auth.orgId
				},
				idempotency_key: `sms.send.requested:${inserted.id}`
			});

			return inserted;
		});
		void touchContactLastContacted(auth.orgId, contact.id);
		return json({ data: { message: result } }, { status: 201 });
	} catch (e) {
		log.error({
			phase: 'tx_error',
			channel: 'sms',
			conversation_id: conv.id,
			org_id: auth.orgId,
			ms: Date.now() - txStart,
			error: e instanceof Error ? e.message : String(e),
			stack: e instanceof Error ? e.stack : undefined
		});
		return json({ error: 'Failed to queue SMS.' }, { status: 500 });
	}
};
