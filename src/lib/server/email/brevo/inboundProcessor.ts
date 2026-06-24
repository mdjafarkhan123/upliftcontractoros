import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import {
	contacts,
	conversations,
	emailDomains,
	inboundCommunicationEvents,
	media,
	messages,
	outboxEvents
} from '$lib/server/db/schema';
import { findOrCreateOpenConversation, recordInboundMessage } from '$lib/server/conversations';
import { touchContactLastContacted } from '$lib/server/contacts/touchLastContacted';
import { createLogger } from '$lib/server/log';
import { correlateInbound, type ParsedAddress } from '../inboundCorrelation';
import { detectForwardedSender } from '../forwardedParser';
import { extractForwardTestToken } from '../forwardingVerification';
import {
	prepareInboundAttachments,
	type PreparedAttachment,
	type RawInboundAttachment
} from '../inboundAttachments';

const log = createLogger('email.webhook.brevo.inbound');

// Brevo inbound parse payload — POST /webhooks/brevo/inbound/{token}/{domain}.
// One webhook delivery may batch several parsed emails in `items`.
type BrevoMailbox = { Address?: string | null; Name?: string | null };
type BrevoHeaders = Record<string, string | string[]> | null;

type BrevoInboundAttachment = {
	Name?: string | null;
	ContentType?: string | null;
	ContentLength?: number | null;
	ContentID?: string | null;
	DownloadToken?: string | null;
};

export type BrevoInboundItem = {
	Uuid?: string[] | null;
	MessageId?: string | null;
	InReplyTo?: string | null;
	From?: BrevoMailbox | null;
	To?: BrevoMailbox[] | null;
	Cc?: BrevoMailbox[] | null;
	Subject?: string | null;
	RawTextBody?: string | null;
	RawHtmlBody?: string | null;
	ExtractedMarkdownMessage?: string | null;
	Headers?: BrevoHeaders;
	Attachments?: BrevoInboundAttachment[] | null;
};

export type BrevoInboundPayload = { items?: BrevoInboundItem[] | null };

function headerValue(headers: BrevoHeaders, name: string): string | null {
	if (!headers) return null;
	const lower = name.toLowerCase();
	for (const [k, v] of Object.entries(headers)) {
		if (k.toLowerCase() === lower) return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
	}
	return null;
}

function referencesValue(headers: BrevoHeaders): string | null {
	if (!headers) return null;
	for (const [k, v] of Object.entries(headers)) {
		if (k.toLowerCase() === 'references') return Array.isArray(v) ? v.join(' ') : v;
	}
	return null;
}

function mailbox(m: BrevoMailbox | null | undefined): ParsedAddress | null {
	if (!m?.Address) return null;
	return { name: m.Name ?? null, address: m.Address.toLowerCase() };
}

function mailboxList(list: BrevoMailbox[] | null | undefined): ParsedAddress[] {
	if (!list) return [];
	return list.map(mailbox).filter((v): v is ParsedAddress => v !== null);
}

function isAutoResponder(headers: BrevoHeaders): boolean {
	const autoSubmitted = headerValue(headers, 'Auto-Submitted')?.toLowerCase().trim();
	if (autoSubmitted && autoSubmitted !== 'no') return true;
	const precedence = headerValue(headers, 'Precedence')?.toLowerCase().trim();
	if (precedence === 'bulk' || precedence === 'list' || precedence === 'auto_reply') return true;
	if (headerValue(headers, 'List-Unsubscribe')) return true;
	return false;
}

function buildPlainBody(text: string | null | undefined, html: string | null | undefined): string {
	if (text && text.trim()) return text.trim();
	if (!html) return '';
	const stripped = html
		.replace(/<style[\s\S]*?<\/style>/gi, '')
		.replace(/<script[\s\S]*?<\/script>/gi, '')
		.replace(/<br\s*\/?>/gi, '\n')
		.replace(/<\/p>/gi, '\n\n')
		.replace(/<[^>]+>/g, '')
		.replace(/&nbsp;/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'");
	return stripped.replace(/\n{3,}/g, '\n\n').trim();
}

function toRawAttachments(
	list: BrevoInboundAttachment[] | null | undefined
): RawInboundAttachment[] {
	if (!list) return [];
	return list.map((a) => ({
		filename: a.Name ?? null,
		content_type: a.ContentType ?? null,
		downloadToken: a.DownloadToken ?? null,
		size: a.ContentLength ?? null
	}));
}

// Stable per-item dedup key. Prefer the recipient Uuid (Brevo's per-delivery id);
// fall back to the Message-ID header.
function itemKey(item: BrevoInboundItem): string | null {
	if (item.Uuid?.length) return item.Uuid.join(',');
	if (item.MessageId) return item.MessageId;
	return null;
}

// Forwarding round-trip verification (Stage 1.3). Marks the org's pending test as
// passed when its token returns. Scoped to org + the stored pending token so a
// stale/old marker can never re-flip a later test. Returns false on no match.
async function completeForwardTest(orgId: string, token: string): Promise<boolean> {
	const updated = await db
		.update(emailDomains)
		.set({
			forward_test_status: 'passed',
			forward_test_verified_at: new Date(),
			updated_at: new Date()
		})
		.where(
			and(
				eq(emailDomains.org_id, orgId),
				eq(emailDomains.forward_test_token, token),
				eq(emailDomains.forward_test_status, 'pending')
			)
		)
		.returning({ id: emailDomains.id });
	return updated.length > 0;
}

async function alreadyProcessed(orgId: string, eventId: string): Promise<boolean> {
	const [row] = await db
		.select({ id: inboundCommunicationEvents.id })
		.from(inboundCommunicationEvents)
		.where(
			and(
				eq(inboundCommunicationEvents.org_id, orgId),
				eq(inboundCommunicationEvents.provider, 'brevo_inbound'),
				eq(inboundCommunicationEvents.provider_event_id, eventId)
			)
		)
		.limit(1);
	return Boolean(row);
}

async function recordAudit(args: {
	orgId: string;
	eventId: string;
	payload: unknown;
	error?: string;
}) {
	await db
		.insert(inboundCommunicationEvents)
		.values({
			org_id: args.orgId,
			provider: 'brevo_inbound',
			provider_event_id: args.eventId,
			event_type: 'email',
			raw_payload: args.payload as object,
			processed_at: new Date(),
			error: args.error ?? null
		})
		.onConflictDoNothing();
}

async function processItem(orgId: string, item: BrevoInboundItem): Promise<void> {
	const eventId = itemKey(item);
	if (!eventId) {
		log.warn({ phase: 'no_event_id', org_id: orgId });
		return;
	}
	if (await alreadyProcessed(orgId, eventId)) return;

	// Forwarding verification round-trip (Stage 1.3): if this email carries our
	// verification marker, complete the test and STOP — never correlate, never
	// create a contact/lead/conversation/message. Checked before the autoresponder
	// guard so a forwarder that stamps Precedence can't drop it. The marker rides
	// the subject (survives Fwd:/FW: prefixes) with the raw body as a fallback.
	const verifyToken =
		extractForwardTestToken(item.Subject) ?? extractForwardTestToken(item.RawTextBody);
	if (verifyToken) {
		const passed = await completeForwardTest(orgId, verifyToken);
		log.info({
			phase: passed ? 'forward_test_verified' : 'forward_test_token_mismatch',
			org_id: orgId,
			event_id: eventId
		});
		await recordAudit({
			orgId,
			eventId,
			payload: item,
			error: passed ? undefined : 'forward_test_token_mismatch'
		});
		return;
	}

	const headers = item.Headers ?? null;

	// Auto-responder / loop protection.
	if (isAutoResponder(headers)) {
		log.info({ phase: 'autoresponder_dropped', org_id: orgId, event_id: eventId });
		await recordAudit({ orgId, eventId, payload: item, error: 'autoresponder' });
		return;
	}

	const envelopeFrom = mailbox(item.From);
	const toAndCc = [...mailboxList(item.To), ...mailboxList(item.Cc)];
	const inReplyTo = item.InReplyTo ?? headerValue(headers, 'In-Reply-To');
	const references = referencesValue(headers);

	const body = buildPlainBody(item.RawTextBody, item.RawHtmlBody);
	const rawAttachments = toRawAttachments(item.Attachments);

	// Method B (manual forward): if the body carries a forwarded header block,
	// recover the ORIGINAL sender and correlate under them instead of the
	// contractor who forwarded it. Only override when the recovered sender
	// actually differs from the envelope From (an ordinary reply with a quoted
	// "From:" line, or a self-forward, falls through to the envelope sender).
	const forwardedFrom = detectForwardedSender(body);
	const isForwarded = !!forwardedFrom && forwardedFrom.address !== envelopeFrom?.address;
	const from = isForwarded ? forwardedFrom : envelopeFrom;

	const match = await correlateInbound({ orgId, from, toAndCc, inReplyTo, references });

	if (!match) {
		log.info({
			phase: 'no_match',
			org_id: orgId,
			event_id: eventId,
			from: from?.address ?? null,
			to: toAndCc.map((a) => a.address)
		});
		await recordAudit({ orgId, eventId, payload: item, error: 'unmatched' });
		return;
	}

	// Drop pure-empty inbound (no body, no attachments).
	if (!body && rawAttachments.length === 0) {
		log.info({ phase: 'empty_dropped', org_id: orgId, event_id: eventId });
		await recordAudit({ orgId, eventId, payload: item, error: 'empty_payload' });
		return;
	}

	// Resolve the contact + conversation ids. Three shapes:
	//  - new_contact: unknown sender → create the lead, emit contact.created +
	//    lead.created, then open its conversation (one tx, so attachment R2 keys
	//    can bind to a real conversation id). Mirrors the missed-call/Messenger
	//    inbound-lead pattern.
	//  - createdConversation: known contact, no open thread → open one (own tx).
	//  - otherwise: known contact with an existing thread.
	let contactId: string;
	let conversationId: string;
	let createdConversation = false;
	let createdContact = false;

	if (match.newContact) {
		const nc = match.newContact;
		const result = await db.transaction(async (tx) => {
			// Soft dedup (no DB unique constraint on email — emails are legitimately
			// shared by spouses, company info@, etc.). Re-check inside the tx for an
			// existing contact by case-insensitive email; correlateInbound already
			// matched case-insensitively outside the tx, so this is the race guard for
			// a concurrent second email from the same brand-new sender. nc.email is
			// already lowercased upstream, so lower(stored) === nc.email.
			const [existing] = await tx
				.select()
				.from(contacts)
				.where(
					and(
						eq(contacts.org_id, orgId),
						eq(sql`lower(${contacts.email})`, nc.email),
						isNull(contacts.deleted_at)
					)
				)
				.limit(1);

			let contact = existing;
			let isNew = false;
			if (!contact) {
				const [created] = await tx
					.insert(contacts)
					.values({
						org_id: orgId,
						full_name: nc.fullName,
						email: nc.email,
						lead_source: 'inbound_email',
						status: 'lead'
					})
					.returning();
				contact = created;
				isNew = true;
			}

			if (isNew) {
				await tx.insert(outboxEvents).values({
					org_id: orgId,
					event_type: 'contact.created',
					resource_type: 'contact',
					resource_id: contact.id,
					payload: {
						contact_id: contact.id,
						org_id: orgId,
						full_name: contact.full_name,
						phone: null,
						email: contact.email,
						lead_source: contact.lead_source,
						origin: 'email_inbound'
					},
					idempotency_key: `contact.created:${contact.id}`
				});
				await tx.insert(outboxEvents).values({
					org_id: orgId,
					event_type: 'lead.created',
					resource_type: 'contact',
					resource_id: contact.id,
					payload: {
						contact_id: contact.id,
						org_id: orgId,
						lead_source: contact.lead_source,
						origin: 'email_inbound'
					},
					idempotency_key: `lead.created:${contact.id}`
				});
			}

			const { conversation, created } = await findOrCreateOpenConversation(tx, {
				orgId,
				contactId: contact.id,
				createdChannel: 'email',
				reactivate: true
			});
			return { contactId: contact.id, conversationId: conversation.id, created, isNew };
		});
		contactId = result.contactId;
		conversationId = result.conversationId;
		createdConversation = result.created;
		createdContact = result.isNew;
	} else if (match.createdConversation) {
		contactId = match.contactId!;
		const result = await db.transaction(async (tx) => {
			const { conversation, created } = await findOrCreateOpenConversation(tx, {
				orgId,
				contactId: contactId,
				createdChannel: 'email',
				reactivate: true
			});
			return { id: conversation.id, created };
		});
		conversationId = result.id;
		createdConversation = result.created;
	} else {
		contactId = match.contactId!;
		conversationId = match.conversation!.id;
	}

	// Upload attachments (outside any tx) — fetched from Brevo via DownloadToken.
	let prepared: PreparedAttachment[] = [];
	const skipped: { filename: string; reason: string }[] = [];
	if (rawAttachments.length > 0) {
		try {
			const out = await prepareInboundAttachments({
				orgId,
				conversationId,
				attachments: rawAttachments
			});
			prepared = out.prepared;
			skipped.push(...out.skipped);
		} catch (err) {
			log.error({
				phase: 'attachment_upload_failed',
				org_id: orgId,
				event_id: eventId,
				error: err instanceof Error ? err.message : String(err)
			});
			// Continue without attachments — we still want the body in the timeline.
		}
	}

	const subject = item.Subject?.toString().trim() || null;
	const providerMessageId = item.MessageId ? item.MessageId.replace(/^<|>$/g, '') : null;
	const toAddresses = mailboxList(item.To).map((a) => a.address);
	const ccAddresses = mailboxList(item.Cc).map((a) => a.address);

	try {
		await db.transaction(async (tx) => {
			// Reopen closed/snoozed conversation on inbound reply.
			const [conv] = await tx
				.select()
				.from(conversations)
				.where(eq(conversations.id, conversationId))
				.for('update')
				.limit(1);
			if (!conv) throw new Error(`Conversation ${conversationId} vanished mid-processing`);

			if (conv.status !== 'open') {
				await tx
					.update(conversations)
					.set({
						status: 'open',
						closed_at: null,
						closed_by: null,
						closed_reason: null,
						snoozed_until: null,
						snoozed_by: null,
						updated_at: new Date()
					})
					.where(eq(conversations.id, conversationId));
			}

			const inserted = await recordInboundMessage(tx, {
				orgId,
				conversationId,
				channel: 'email',
				body,
				source: 'brevo_inbound',
				emailMeta: {
					email_provider: 'brevo',
					email_provider_message_id: providerMessageId ?? undefined,
					email_subject: subject ?? undefined,
					email_from_address: from?.address ?? undefined,
					email_to_addresses: toAddresses,
					email_cc_addresses: ccAddresses,
					email_in_reply_to: inReplyTo ?? undefined,
					email_references: references ?? undefined
				}
			});

			if (prepared.length > 0) {
				await tx.insert(media).values(
					prepared.map((p) => ({
						org_id: orgId,
						message_id: inserted.id,
						r2_key: p.r2Key,
						original_filename: p.originalFilename,
						file_size_bytes: p.fileSizeBytes,
						media_type: p.mediaType,
						mime_type: p.mimeType,
						purpose_tag: 'message_attachment' as const,
						scan_status: 'pending',
						sha256_hash: p.sha256
					}))
				);
			}

			await tx.insert(outboxEvents).values({
				org_id: orgId,
				event_type: 'message.received',
				resource_type: 'message',
				resource_id: inserted.id,
				payload: {
					message_id: inserted.id,
					conversation_id: conversationId,
					contact_id: contactId,
					org_id: orgId,
					channel: 'email',
					body,
					email_subject: subject,
					email_from_address: from?.address ?? null,
					email_provider_message_id: providerMessageId,
					matched_by: match.matchedBy,
					is_new_conversation: createdConversation,
					is_new_contact: createdContact,
					attachment_count: prepared.length,
					skipped_attachment_count: skipped.length
				},
				idempotency_key: `message.received:${inserted.id}`
			});
		});

		void touchContactLastContacted(orgId, contactId);

		await recordAudit({ orgId, eventId, payload: item });

		if (skipped.length) {
			log.info({ phase: 'attachments_skipped', org_id: orgId, event_id: eventId, skipped });
		}
	} catch (err) {
		// Do NOT write the audit row on failure — it is the idempotency marker.
		// Skipping it lets Brevo retry the webhook and succeed next time.
		log.error({
			phase: 'persist_failed',
			org_id: orgId,
			event_id: eventId,
			error: err instanceof Error ? err.message : String(err)
		});
		throw err;
	}
}

/** Process a Brevo inbound parse webhook for a known org (resolved from domain). */
export async function processBrevoInbound(args: {
	orgId: string;
	payload: BrevoInboundPayload;
}): Promise<void> {
	const items = args.payload.items ?? [];
	for (const item of items) {
		await processItem(args.orgId, item);
	}
}
