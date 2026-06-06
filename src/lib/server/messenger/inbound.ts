import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { contacts, messages, messengerContacts, outboxEvents } from '$lib/server/db/schema';
import { findOrCreateOpenConversation, recordInboundMessage } from '$lib/server/conversations';
import { touchContactLastContacted } from '$lib/server/contacts/touchLastContacted';
import { createLogger } from '$lib/server/log';
import { getUserProfile, type MessengerUserProfile } from './graph';

const log = createLogger('messenger.webhook.inbound');

type Db = typeof db;
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

// ── Meta webhook `messaging` event shapes (only the fields we read) ──────────
// A page-subscribed webhook entry batches one or more `messaging` events. We only
// act on inbound user messages; delivery/read receipts, postbacks, reactions and
// page-side echoes carry other keys and are ignored.
type MessengerAttachment = {
	type?: string; // 'image' | 'video' | 'audio' | 'file' | 'location' | 'fallback' | ...
	payload?: { url?: string | null } | null;
};

type MessengerMessage = {
	mid?: string;
	text?: string;
	is_echo?: boolean;
	attachments?: MessengerAttachment[] | null;
};

type MessengerMessagingEvent = {
	sender?: { id?: string } | null;
	recipient?: { id?: string } | null;
	timestamp?: number;
	message?: MessengerMessage | null;
};

type AttachmentRef = { type: string; url: string };

/** Attachment URLs we can hand to a future media worker. URL-less attachments
 *  (e.g. location) are dropped here but still counted for the body label. */
function collectAttachmentRefs(raw: MessengerAttachment[]): AttachmentRef[] {
	const out: AttachmentRef[] = [];
	for (const a of raw) {
		const url = a?.payload?.url;
		if (typeof url === 'string' && url.length > 0) {
			out.push({ type: typeof a.type === 'string' ? a.type : 'file', url });
		}
	}
	return out;
}

/** Human-readable placeholder body for an attachment-only message so the thread
 *  and inbox preview are never empty. Real media fetch/store is deferred to a
 *  Messenger media worker (the current media worker is Twilio-auth-coupled). */
function attachmentLabel(raw: MessengerAttachment[]): string {
	switch (raw[0]?.type) {
		case 'image':
			return '[Photo]';
		case 'video':
			return '[Video]';
		case 'audio':
			return '[Audio]';
		case 'file':
			return '[File]';
		case 'location':
			return '[Location]';
		default:
			return '[Attachment]';
	}
}

function buildName(profile: MessengerUserProfile | null): string {
	const name = [profile?.first_name, profile?.last_name]
		.filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
		.join(' ')
		.trim();
	return name.length > 0 ? name : 'Messenger User';
}

function sentAtFrom(timestamp: number | undefined): Date {
	if (typeof timestamp === 'number' && Number.isFinite(timestamp) && timestamp > 0) {
		const d = new Date(timestamp);
		if (!Number.isNaN(d.getTime())) return d;
	}
	return new Date();
}

/**
 * Resolve a PSID to a contact inside the transaction. Existing PSID → its
 * contact. New PSID → create a phoneless contact (Messenger identity is the
 * PSID, not a phone) plus its `messenger_contacts` mapping, using the name
 * pre-fetched from the Graph profile. Tolerates a concurrent-delivery race via
 * the `messenger_contacts` unique index: on conflict the optimistically-created
 * contact is removed and the winner's contact is used.
 */
async function resolveContact(
	tx: Tx,
	args: { orgId: string; pageId: string; psid: string; fullName: string }
): Promise<{ contactId: string; isNew: boolean }> {
	const [existing] = await tx
		.select({ contactId: messengerContacts.contact_id })
		.from(messengerContacts)
		.where(
			and(
				eq(messengerContacts.org_id, args.orgId),
				eq(messengerContacts.page_id, args.pageId),
				eq(messengerContacts.psid, args.psid)
			)
		)
		.limit(1);
	if (existing) return { contactId: existing.contactId, isNew: false };

	const [contact] = await tx
		.insert(contacts)
		.values({
			org_id: args.orgId,
			full_name: args.fullName,
			phone: null,
			lead_source: 'other',
			status: 'lead',
			preferred_contact_method: 'messenger'
		})
		.returning({ id: contacts.id });

	const [mapping] = await tx
		.insert(messengerContacts)
		.values({
			org_id: args.orgId,
			page_id: args.pageId,
			psid: args.psid,
			contact_id: contact.id
		})
		.onConflictDoNothing()
		.returning({ contactId: messengerContacts.contact_id });

	if (mapping) return { contactId: contact.id, isNew: true };

	// Lost the race — another delivery mapped this PSID first. Drop the contact
	// we just created (nothing references it yet) and use the winner.
	await tx.delete(contacts).where(eq(contacts.id, contact.id));
	const [winner] = await tx
		.select({ contactId: messengerContacts.contact_id })
		.from(messengerContacts)
		.where(
			and(
				eq(messengerContacts.org_id, args.orgId),
				eq(messengerContacts.page_id, args.pageId),
				eq(messengerContacts.psid, args.psid)
			)
		)
		.limit(1);
	if (!winner) throw new Error('messenger resolveContact: conflict but no mapping found');
	return { contactId: winner.contactId, isNew: false };
}

async function processMessage(args: {
	orgId: string;
	pageId: string;
	pageAccessToken: string;
	event: MessengerMessagingEvent;
}): Promise<void> {
	const { orgId, pageId, pageAccessToken, event } = args;
	const message = event.message;

	// Only inbound user messages. Skip page-side echoes (our own / Meta-inbox
	// sends) and any non-message event (delivery, read, postback, reaction).
	if (!message || message.is_echo === true) return;

	const psid = event.sender?.id;
	const mid = message.mid;
	if (!psid || !mid) return; // can't identify or dedup → ignore

	// Dedup: Meta redelivers webhook batches. The partial unique index on
	// messenger_mid is the hard guard; this pre-check skips the work cheaply.
	const [dup] = await db
		.select({ id: messages.id })
		.from(messages)
		.where(eq(messages.messenger_mid, mid))
		.limit(1);
	if (dup) return;

	const text = typeof message.text === 'string' ? message.text.trim() : '';
	const rawAttachments = Array.isArray(message.attachments) ? message.attachments : [];
	const attachmentRefs = collectAttachmentRefs(rawAttachments);

	// Only image/file attachments are fetched + stored as media (the media table
	// holds images + PDFs). Video/audio/location/links keep a text label instead.
	const storableRefs = attachmentRefs.filter((r) => r.type === 'image' || r.type === 'file');
	const hasStorable = storableRefs.length > 0;

	// Real text wins. Otherwise storable attachments render as media so the body
	// stays empty (the inbox preview shows "📷 Photo" via hasMedia, matching MMS);
	// only non-storable attachments fall back to a text label so the thread bubble
	// is never empty.
	let body: string;
	if (text.length > 0) {
		body = text;
	} else if (hasStorable) {
		body = '';
	} else if (rawAttachments.length > 0) {
		body = attachmentLabel(rawAttachments);
	} else {
		body = '';
	}

	// Nothing to store at all (empty message, no attachments — e.g. an unsupported event).
	if (!body && !hasStorable) return;

	const sentAt = sentAtFrom(event.timestamp);

	// Decide whether we need the Graph profile lookup (NEW contacts only) BEFORE
	// opening the tx — the profile fetch is an external call and must never run
	// inside a transaction. A re-check inside the tx is authoritative for races.
	const [known] = await db
		.select({ contactId: messengerContacts.contact_id })
		.from(messengerContacts)
		.where(
			and(
				eq(messengerContacts.org_id, orgId),
				eq(messengerContacts.page_id, pageId),
				eq(messengerContacts.psid, psid)
			)
		)
		.limit(1);

	const fullName = known ? '' : buildName(await getUserProfile(pageAccessToken, psid));

	let touchedContactId: string | null = null;
	try {
		await db.transaction(async (tx) => {
			const { contactId, isNew } = await resolveContact(tx, { orgId, pageId, psid, fullName });

			if (isNew) {
				await tx.insert(outboxEvents).values({
					org_id: orgId,
					event_type: 'contact.created',
					resource_type: 'contact',
					resource_id: contactId,
					payload: {
						contact_id: contactId,
						org_id: orgId,
						full_name: fullName,
						phone: null,
						lead_source: 'other',
						origin: 'messenger_inbound'
					},
					idempotency_key: `contact.created:${contactId}`
				});
				await tx.insert(outboxEvents).values({
					org_id: orgId,
					event_type: 'lead.created',
					resource_type: 'contact',
					resource_id: contactId,
					payload: {
						contact_id: contactId,
						org_id: orgId,
						lead_source: 'other',
						origin: 'messenger_inbound'
					},
					idempotency_key: `lead.created:${contactId}`
				});
			}

			const { conversation: conv } = await findOrCreateOpenConversation(tx, {
				orgId,
				contactId,
				createdChannel: 'messenger',
				reactivate: true
			});

			const inserted = await recordInboundMessage(tx, {
				orgId,
				conversationId: conv.id,
				channel: 'messenger',
				body,
				messengerMid: mid,
				source: 'messenger_webhook',
				sentAt,
				hasMedia: hasStorable
			});

			await tx.insert(outboxEvents).values({
				org_id: orgId,
				event_type: 'message.received',
				resource_type: 'message',
				resource_id: inserted.id,
				payload: {
					message_id: inserted.id,
					conversation_id: conv.id,
					contact_id: contactId,
					org_id: orgId,
					channel: 'messenger',
					body,
					messenger_mid: mid,
					is_new_contact: isNew,
					// Full attachment list (incl. non-stored video/audio/location) for audit.
					attachments: attachmentRefs
				},
				idempotency_key: `message.received:${inserted.id}`
			});

			// Fetch + store image/file attachments via the shared media worker
			// (media_source:'messenger' → public no-auth fetch + byte-sniffed mime).
			// Decoupled from the message insert so a transient fetch failure can
			// retry without re-creating the messenger_mid-deduped message.
			if (hasStorable) {
				await tx.insert(outboxEvents).values({
					org_id: orgId,
					event_type: 'message.media.received',
					resource_type: 'message',
					resource_id: inserted.id,
					payload: {
						message_id: inserted.id,
						conversation_id: conv.id,
						contact_id: contactId,
						org_id: orgId,
						media_source: 'messenger',
						media: storableRefs.map((r) => ({ url: r.url }))
					},
					idempotency_key: `message.media.received:${inserted.id}`
				});
			}

			touchedContactId = contactId;
		});
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		// A unique-violation on messenger_mid means a concurrent delivery already
		// stored this exact message — treat as processed, not an error.
		if (/unique|duplicate/i.test(msg) && /messenger_mid/i.test(msg)) return;
		// Genuine persist failure — re-throw so the route returns non-200 and Meta
		// redelivers (matches the Twilio/Brevo inbound handlers). messenger_mid
		// dedup makes the retry safe; the raw entry is already audited.
		log.error({ phase: 'persist_failed', org_id: orgId, page_id: pageId, mid, error: msg });
		throw e;
	}

	if (touchedContactId) void touchContactLastContacted(orgId, touchedContactId);
}

/**
 * Normalize the `messaging[]` array of one webhook entry (already resolved to an
 * org + Page token by the route). Each event is processed independently so one
 * failure never blocks the others or the webhook ack.
 */
export async function processMessengerEntry(args: {
	orgId: string;
	pageId: string;
	pageAccessToken: string;
	messaging: unknown[];
}): Promise<void> {
	for (const raw of args.messaging) {
		if (!raw || typeof raw !== 'object') continue;
		await processMessage({
			orgId: args.orgId,
			pageId: args.pageId,
			pageAccessToken: args.pageAccessToken,
			event: raw as MessengerMessagingEvent
		});
	}
}
