import { json, error } from '@sveltejs/kit';
import { and, asc, desc, eq, inArray, isNull, isNotNull, lt, or } from 'drizzle-orm';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import {
	contacts,
	conversations,
	emailSenderAddresses,
	media,
	messages,
	messengerContacts,
	organizations,
	outboxEvents,
	webchatSessions
} from '$lib/server/db/schema';
import { defaultLocalPart } from '$lib/server/email/senderAddresses';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { isReleasedPhone } from '$lib/utils/phone';
import { createLogger } from '$lib/server/log';
import { touchContactLastContacted } from '$lib/server/contacts/touchLastContacted';
import { recordOutboundMessage, type OutboundChannel } from '$lib/server/conversations';
import { ensureReplyAlias } from '$lib/server/email/replyAlias';
import { getCreditState } from '$lib/server/sms/credit';

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
	// Body may be empty when the message carries media (e.g. a photo-only MMS).
	// A "body or media required" check runs after parse.
	body: z.string().max(10_000, 'Message too long').default(''),
	channel: z.enum(['sms', 'webchat', 'email', 'messenger']).optional(),
	email_subject: z.string().trim().max(255).optional(),
	// Optional From override for email — must be the org default or one of its extra
	// branded addresses (validated against the DB in the email branch). Same local-part
	// rule as the email-settings endpoints.
	from_local_part: z
		.string()
		.trim()
		.toLowerCase()
		.min(1)
		.max(64)
		.regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/)
		.optional(),
	is_internal_note: z.boolean().optional().default(false),
	attachments: z.array(attachmentSchema).max(10).optional(),
	// Pre-uploaded media (via /api/media/upload as contact attachments) to re-link
	// onto this message atomically inside the send transaction.
	media_ids: z.array(z.string().uuid()).max(10).optional(),
	interpolate: z.boolean().optional().default(false)
});

// Supported quick-reply tokens: {contact_name}, {org_name}. Final substitution
// happens server-side with fresh DB values so a rename mid-flight does not leak.
function interpolateMessageBody(
	body: string,
	ctx: { contact_name: string; org_name: string }
): string {
	return body.replaceAll('{contact_name}', ctx.contact_name).replaceAll('{org_name}', ctx.org_name);
}

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

	// Newest-first pagination: the first page is the latest PAGE_SIZE messages,
	// the cursor walks older ("load earlier"). Rows are returned in ascending
	// order so the client renders/prepends without re-sorting.
	const cursor = event.url.searchParams.get('cursor');
	const conditions = [eq(messages.conversation_id, conversationId)];
	if (cursor) {
		const [createdAt, id] = cursor.split('|');
		if (createdAt && id) {
			const cursorDate = new Date(createdAt);
			conditions.push(
				or(
					lt(messages.created_at, cursorDate),
					and(eq(messages.created_at, cursorDate), lt(messages.id, id))
				)!
			);
		}
	}

	const rows = await db
		.select()
		.from(messages)
		.where(and(...conditions))
		.orderBy(desc(messages.created_at), desc(messages.id))
		.limit(PAGE_SIZE + 1);

	const hasMore = rows.length > PAGE_SIZE;
	const page = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
	const oldest = page[page.length - 1];
	const nextCursor = hasMore && oldest ? `${oldest.created_at.toISOString()}|${oldest.id}` : null;
	const sliced = page.reverse();

	// Attach media (photos/files) for this page of messages in one query.
	const messageIds = sliced.map((m) => m.id);
	const mediaRows = messageIds.length
		? await db
				.select({
					id: media.id,
					message_id: media.message_id,
					r2_key: media.r2_key,
					thumbnail_key: media.thumbnail_key,
					web_key: media.web_key,
					original_filename: media.original_filename,
					file_size_bytes: media.file_size_bytes,
					media_type: media.media_type,
					mime_type: media.mime_type,
					purpose_tag: media.purpose_tag,
					created_at: media.created_at
				})
				.from(media)
				.where(and(inArray(media.message_id, messageIds), isNull(media.deleted_at)))
				.orderBy(asc(media.created_at), asc(media.id))
		: [];

	const mediaByMessage = new Map<string, (typeof mediaRows)[number][]>();
	for (const row of mediaRows) {
		if (!row.message_id) continue;
		const list = mediaByMessage.get(row.message_id) ?? [];
		list.push(row);
		mediaByMessage.set(row.message_id, list);
	}

	const items = sliced.map((m) => ({ ...m, media: mediaByMessage.get(m.id) ?? [] }));

	return json({ data: { items, next_cursor: nextCursor } });
};

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Auto-reopen a closed or snoozed conversation when an outbound message is sent
 * into it. Runs inside the send transaction so the reopen and the message are
 * atomic — the thread can never end up "closed" with a fresh outbound message.
 */
async function reopenConversationIfNeeded(
	tx: Tx,
	conv: { id: string; status: string }
): Promise<void> {
	if (conv.status === 'open') return;
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

type MessageMediaRow = {
	id: string;
	r2_key: string;
	thumbnail_key: string | null;
	web_key: string | null;
	original_filename: string;
	file_size_bytes: number;
	media_type: 'photo' | 'pdf' | 'attachment';
	mime_type: string;
	purpose_tag: string;
	created_at: Date;
};

/**
 * Re-link pre-uploaded contact-attachment media onto a message inside the send
 * transaction. Guarded so it only moves media that (a) belongs to this org and
 * contact, (b) is still unattached (message_id IS NULL), and (c) isn't deleted.
 * If the count doesn't match the requested ids it throws, rolling back the whole
 * send so no orphaned/half-linked media is left behind.
 */
async function reparentMediaToMessage(
	tx: Tx,
	args: { orgId: string; contactId: string; messageId: string; mediaIds: string[] }
): Promise<void> {
	if (args.mediaIds.length === 0) return;
	const updated = await tx
		.update(media)
		.set({
			message_id: args.messageId,
			contact_id: null,
			purpose_tag: 'message_attachment',
			updated_at: new Date()
		})
		.where(
			and(
				inArray(media.id, args.mediaIds),
				eq(media.org_id, args.orgId),
				eq(media.contact_id, args.contactId),
				isNull(media.message_id),
				isNull(media.deleted_at)
			)
		)
		.returning({ id: media.id });
	if (updated.length !== args.mediaIds.length) {
		throw new Error('attachment_relink_mismatch');
	}
}

async function fetchMessageMedia(messageId: string): Promise<MessageMediaRow[]> {
	return db
		.select({
			id: media.id,
			r2_key: media.r2_key,
			thumbnail_key: media.thumbnail_key,
			web_key: media.web_key,
			original_filename: media.original_filename,
			file_size_bytes: media.file_size_bytes,
			media_type: media.media_type,
			mime_type: media.mime_type,
			purpose_tag: media.purpose_tag,
			created_at: media.created_at
		})
		.from(media)
		.where(and(eq(media.message_id, messageId), isNull(media.deleted_at)))
		.orderBy(asc(media.created_at), asc(media.id));
}

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

	// Block all outbound messages (any channel) when the contact has a hard DNC flag.
	// Internal notes are exempt — they are staff-only and never reach the contact.
	if (contact.do_not_contact && !parsed.is_internal_note) {
		return json(
			{ error: 'This contact is marked Do Not Contact. Remove the flag before sending.' },
			{ status: 422 }
		);
	}

	const mediaIds = parsed.media_ids ?? [];

	// A message must have text, media, or both.
	if (!parsed.body.trim() && mediaIds.length === 0) {
		return json(
			{ error: 'Message body is required', field_errors: { body: 'Message body is required' } },
			{ status: 400 }
		);
	}

	// Validate the attachments up-front so we can return a clean 400 instead of
	// rolling back the send transaction. They must be this org's, tied to this
	// contact, still unattached, and not deleted.
	if (mediaIds.length > 0) {
		const valid = await db
			.select({ id: media.id })
			.from(media)
			.where(
				and(
					inArray(media.id, mediaIds),
					eq(media.org_id, auth.orgId),
					eq(media.contact_id, conv.contact_id),
					isNull(media.message_id),
					isNull(media.deleted_at)
				)
			);
		if (valid.length !== mediaIds.length) {
			return json(
				{
					error: 'One or more attachments are invalid or already sent.',
					field_errors: { attachments: 'Invalid attachment' }
				},
				{ status: 400 }
			);
		}
	}

	// Quick-reply token interpolation — done here with fresh DB values so
	// renames or org changes between page load and send never leak old data.
	if (parsed.interpolate) {
		const [orgRow] = await db
			.select({ name: organizations.name })
			.from(organizations)
			.where(eq(organizations.id, auth.orgId))
			.limit(1);
		parsed.body = interpolateMessageBody(parsed.body, {
			contact_name: contact.full_name,
			org_name: orgRow?.name ?? ''
		});
	}

	// Internal notes — no transport, no outbox emit.
	if (parsed.is_internal_note) {
		const inheritedChannel = conv.last_message_channel ?? 'sms';
		const inserted = await db.transaction(async (tx) => {
			const row = await recordOutboundMessage(tx, {
				orgId: auth.orgId,
				conversationId: conv.id,
				channel: inheritedChannel,
				body: parsed.body,
				sentBy: auth.member.id,
				isInternalNote: true,
				source: 'api'
			});
			await reparentMediaToMessage(tx, {
				orgId: auth.orgId,
				contactId: conv.contact_id,
				messageId: row.id,
				mediaIds
			});
			return row;
		});
		const mediaRows = mediaIds.length > 0 ? await fetchMessageMedia(inserted.id) : [];
		return json({ data: { message: { ...inserted, media: mediaRows } } }, { status: 201 });
	}

	const outboundChannel = await resolveOutboundChannel(conv.id, parsed.channel);

	// ── Email branch (async via outbox → email worker) ───────────────────────
	if (outboundChannel === 'email') {
		if (!contact.email) {
			return json(
				{
					error: 'Contact does not have an email address.',
					field_errors: { channel: 'No email on file' }
				},
				{ status: 400 }
			);
		}

		// Resolve the From override (one of the org's extra branded addresses). It is
		// snapshotted into the outbox payload so the worker sends from exactly what was
		// chosen, even if the address is edited or removed afterwards. Omitted → worker
		// uses the org default.
		let fromLocalPart: string | undefined;
		if (parsed.from_local_part) {
			const [org] = await db
				.select({
					slug: organizations.slug,
					email_sender_local: organizations.email_sender_local
				})
				.from(organizations)
				.where(eq(organizations.id, auth.orgId))
				.limit(1);
			if (!org) return json({ error: 'Organization not found.' }, { status: 404 });

			if (parsed.from_local_part === defaultLocalPart(org)) {
				fromLocalPart = parsed.from_local_part;
			} else {
				const [extra] = await db
					.select({ id: emailSenderAddresses.id })
					.from(emailSenderAddresses)
					.where(
						and(
							eq(emailSenderAddresses.org_id, auth.orgId),
							eq(emailSenderAddresses.local_part, parsed.from_local_part)
						)
					)
					.limit(1);
				if (!extra) {
					return json(
						{
							error: 'That sending address is not available.',
							field_errors: { from_local_part: 'Unknown sending address' }
						},
						{ status: 400 }
					);
				}
				fromLocalPart = parsed.from_local_part;
			}
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
		// Cap References header at the 15 most recent IDs — some mail servers
		// behave poorly with bloated References headers.
		const references = (() => {
			if (!lastEmail) return null;
			const prior = (lastEmail.email_references ?? '').split(/\s+/).filter(Boolean);
			const tail = lastEmail.email_provider_message_id ? [lastEmail.email_provider_message_id] : [];
			const all = [...prior, ...tail];
			const capped = all.slice(-15);
			return capped.length > 0 ? capped.join(' ') : null;
		})();

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
					hasMedia: mediaIds.length > 0,
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

				await reparentMediaToMessage(tx, {
					orgId: auth.orgId,
					contactId: conv.contact_id,
					messageId: inserted.id,
					mediaIds
				});

				await reopenConversationIfNeeded(tx, conv);

				await tx.insert(outboxEvents).values({
					org_id: auth.orgId,
					event_type: 'email.send.requested',
					resource_type: 'message',
					resource_id: inserted.id,
					payload: {
						message_id: inserted.id,
						conversation_id: conv.id,
						contact_id: contact.id,
						org_id: auth.orgId,
						...(fromLocalPart ? { from_local_part: fromLocalPart } : {})
					},
					idempotency_key: `email.send.requested:${inserted.id}`
				});

				return inserted;
			});
			void touchContactLastContacted(auth.orgId, contact.id);
			const mediaRows = mediaIds.length > 0 ? await fetchMessageMedia(result.id) : [];
			return json({ data: { message: { ...result, media: mediaRows } } }, { status: 201 });
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
					source: 'api',
					hasMedia: mediaIds.length > 0
				});

				await reparentMediaToMessage(tx, {
					orgId: auth.orgId,
					contactId: conv.contact_id,
					messageId: inserted.id,
					mediaIds
				});

				await reopenConversationIfNeeded(tx, conv);

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
			const mediaRows = mediaIds.length > 0 ? await fetchMessageMedia(result.id) : [];
			return json({ data: { message: { ...result, media: mediaRows } } }, { status: 201 });
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

	// ── Messenger branch (async via outbox → messenger worker) ──────────────
	if (outboundChannel === 'messenger') {
		// v1 sends text only — outbound media is deferred to the Messenger media work.
		if (mediaIds.length > 0 || (parsed.attachments?.length ?? 0) > 0) {
			return json(
				{
					error: 'Attachments are not supported on Messenger yet.',
					field_errors: { attachments: 'Not supported on Messenger' }
				},
				{ status: 400 }
			);
		}
		if (!parsed.body.trim()) {
			return json(
				{ error: 'Message body is required', field_errors: { body: 'Message body is required' } },
				{ status: 400 }
			);
		}
		// The contact must have a Messenger identity (PSID) on file — created on
		// inbound. Without it there is no recipient to send to.
		const [identity] = await db
			.select({ id: messengerContacts.id })
			.from(messengerContacts)
			.where(
				and(
					eq(messengerContacts.org_id, auth.orgId),
					eq(messengerContacts.contact_id, conv.contact_id)
				)
			)
			.limit(1);
		if (!identity) {
			return json(
				{
					error: 'Contact has no Messenger conversation.',
					field_errors: { channel: 'No Messenger identity' }
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
					channel: 'messenger',
					body: parsed.body,
					sentBy: auth.member.id,
					status: 'queued',
					source: 'api'
				});

				await reopenConversationIfNeeded(tx, conv);

				await tx.insert(outboxEvents).values({
					org_id: auth.orgId,
					event_type: 'messenger.send.requested',
					resource_type: 'message',
					resource_id: inserted.id,
					payload: {
						message_id: inserted.id,
						conversation_id: conv.id,
						contact_id: contact.id,
						org_id: auth.orgId
					},
					idempotency_key: `messenger.send.requested:${inserted.id}`
				});

				return inserted;
			});
			void touchContactLastContacted(auth.orgId, contact.id);
			return json({ data: { message: result } }, { status: 201 });
		} catch (e) {
			log.error({
				phase: 'tx_error',
				channel: 'messenger',
				conversation_id: conv.id,
				org_id: auth.orgId,
				ms: Date.now() - txStart,
				error: e instanceof Error ? e.message : String(e),
				stack: e instanceof Error ? e.stack : undefined
			});
			return json({ error: 'Failed to queue Messenger message.' }, { status: 500 });
		}
	}

	// ── SMS branch (async via outbox → SMS worker) ──────────────────────────
	if (!contact.phone) {
		return json(
			{
				error: 'Contact does not have a phone number.',
				field_errors: { channel: 'No phone on file' }
			},
			{ status: 400 }
		);
	}
	if (contact.sms_opt_out) {
		return json({ error: 'Contact has opted out of SMS.' }, { status: 400 });
	}
	if (isReleasedPhone(contact.phone)) {
		return json({ error: 'Contact phone number has been released.' }, { status: 400 });
	}

	const [org] = await db
		.select({
			twilio_phone_number: organizations.twilio_phone_number
		})
		.from(organizations)
		.where(eq(organizations.id, auth.orgId))
		.limit(1);
	if (!org?.twilio_phone_number) {
		return json({ error: 'Organization is not configured for SMS.' }, { status: 400 });
	}

	// Soft pre-flight: surface an out-of-credit rejection immediately so the UI
	// doesn't enqueue a doomed send. The authoritative atomic reservation still
	// runs in the SMS worker just before Twilio is called.
	const credit = await getCreditState(db, auth.orgId);
	if (!credit || credit.balance < credit.per_sms_cost) {
		return json(
			{
				error:
					'Out of SMS credit. Contact your account manager to top up before sending more texts.'
			},
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
				source: 'api',
				hasMedia: mediaIds.length > 0
			});

			await reopenConversationIfNeeded(tx, conv);

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
