import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import {
	contacts,
	conversations,
	inboundCommunicationEvents,
	media,
	messages,
	outboxEvents
} from '$lib/server/db/schema';
import {
	findOrCreateOpenConversation,
	recordInboundMessage
} from '$lib/server/conversations';
import { touchContactLastContacted } from '$lib/server/contacts/touchLastContacted';
import { createLogger } from '$lib/server/log';
import {
	correlateInbound,
	parseAddresses,
	parseMessageIds,
	type ParsedAddress
} from './inboundCorrelation';
import {
	prepareInboundAttachments,
	type PreparedAttachment,
	type RawInboundAttachment
} from './inboundAttachments';

const log = createLogger('email.webhook.inbound');

type HeaderArray = { name: string; value: string }[];
type HeaderMap = Record<string, string>;

export type ResendInboundEvent = {
	type?: string;
	created_at?: string;
	data?: {
		message_id?: string;
		from?: string | ParsedAddress;
		to?: string | string[];
		cc?: string | string[];
		subject?: string | null;
		text?: string | null;
		html?: string | null;
		in_reply_to?: string | null;
		references?: string | string[] | null;
		headers?: HeaderArray | HeaderMap | null;
		attachments?: RawInboundAttachment[] | null;
	};
};

function headerValue(
	headers: HeaderArray | HeaderMap | null | undefined,
	name: string
): string | null {
	if (!headers) return null;
	const lower = name.toLowerCase();
	if (Array.isArray(headers)) {
		for (const h of headers) {
			if (h?.name?.toLowerCase() === lower) return h.value ?? null;
		}
		return null;
	}
	for (const [k, v] of Object.entries(headers)) {
		if (k.toLowerCase() === lower) return v ?? null;
	}
	return null;
}

function normalizeFrom(raw: string | ParsedAddress | null | undefined): ParsedAddress | null {
	if (!raw) return null;
	if (typeof raw === 'string') return parseAddresses(raw)[0] ?? null;
	if (typeof raw === 'object' && 'address' in raw && typeof raw.address === 'string') {
		return { name: raw.name ?? null, address: raw.address.toLowerCase() };
	}
	return null;
}

function normalizeList(raw: string | string[] | undefined | null): ParsedAddress[] {
	if (!raw) return [];
	if (Array.isArray(raw)) return raw.flatMap((s) => parseAddresses(s));
	return parseAddresses(raw);
}

function isAutoResponder(headers: HeaderArray | HeaderMap | null | undefined): boolean {
	const autoSubmitted = headerValue(headers, 'Auto-Submitted')?.toLowerCase().trim();
	if (autoSubmitted && autoSubmitted !== 'no') return true;
	const precedence = headerValue(headers, 'Precedence')?.toLowerCase().trim();
	if (precedence === 'bulk' || precedence === 'list' || precedence === 'auto_reply') return true;
	const listUnsub = headerValue(headers, 'List-Unsubscribe');
	if (listUnsub) return true;
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

async function recordAudit(args: {
	orgId: string | null;
	svixId: string;
	eventType: string;
	payload: unknown;
	error?: string;
}) {
	// inbound_communication_events.org_id is NOT NULL with FK → organizations.
	// Unmatched / autoresponder drops have no org binding, so we cannot persist
	// them; the request-level log line is the audit trail in that case.
	if (!args.orgId) return;
	await db
		.insert(inboundCommunicationEvents)
		.values({
			org_id: args.orgId,
			provider: 'resend_inbound',
			provider_event_id: args.svixId,
			event_type: args.eventType,
			raw_payload: args.payload as object,
			processed_at: new Date(),
			error: args.error ?? null
		})
		.onConflictDoNothing();
}

export async function processInboundEmail(args: {
	svixId: string;
	event: ResendInboundEvent;
}): Promise<void> {
	const { svixId, event } = args;
	const data = event.data ?? {};

	const headers = data.headers ?? null;
	const inReplyTo = data.in_reply_to ?? headerValue(headers, 'In-Reply-To');
	const refsRaw = Array.isArray(data.references)
		? data.references.join(' ')
		: (data.references ?? headerValue(headers, 'References'));
	const messageIdHeader = data.message_id ?? headerValue(headers, 'Message-ID');

	// Auto-responder / loop protection
	if (isAutoResponder(headers)) {
		log.info({ phase: 'autoresponder_dropped', svix_id: svixId });
		await recordAudit({
			orgId: null,
			svixId,
			eventType: event.type ?? 'email.received',
			payload: event,
			error: 'autoresponder'
		});
		return;
	}

	const from = normalizeFrom(data.from);
	const toAndCc = [...normalizeList(data.to), ...normalizeList(data.cc)];

	const match = await correlateInbound({
		from,
		toAndCc,
		inReplyTo: inReplyTo ?? null,
		references: refsRaw ?? null
	});

	if (!match) {
		log.info({
			phase: 'no_match',
			svix_id: svixId,
			from: from?.address ?? null,
			to: toAndCc.map((a) => a.address)
		});
		await recordAudit({
			orgId: null,
			svixId,
			eventType: event.type ?? 'email.received',
			payload: event,
			error: 'unmatched'
		});
		return;
	}

	const body = buildPlainBody(data.text, data.html);
	const rawAttachments = data.attachments ?? [];

	// Drop pure-empty inbound (no body, no attachments) — keeps the timeline
	// clean from delivery receipts / read receipts that slip past auto-responder
	// detection.
	if (!body && rawAttachments.length === 0) {
		log.info({ phase: 'empty_dropped', svix_id: svixId, org_id: match.orgId });
		await recordAudit({
			orgId: match.orgId,
			svixId,
			eventType: event.type ?? 'email.received',
			payload: event,
			error: 'empty_payload'
		});
		return;
	}

	// We need a conversation id BEFORE we know the R2 key prefix. If the match
	// is "create new conversation", we open it first inside the tx and re-key
	// attachment uploads after. Simpler: when createConversation is true, use a
	// transient placeholder until we have the id — but R2 keys are tied to the
	// conversation. Order:
	//   tx: ensure conversation, get id
	//   outside tx: upload attachments to R2 with that conversation id
	//   tx2: insert message + media + outbox + reopen
	//
	// We accept a second tx because R2 uploads must NEVER happen inside a tx
	// (per CLAUDE.md rule 8).

	let conversationId: string;
	let createdConversation = false;

	if (match.createdConversation) {
		const result = await db.transaction(async (tx) => {
			const { conversation, created } = await findOrCreateOpenConversation(tx, {
				orgId: match.orgId,
				contactId: match.contactId,
				createdChannel: 'email'
			});
			return { id: conversation.id, created };
		});
		conversationId = result.id;
		createdConversation = result.created;
	} else {
		conversationId = match.conversation.id;
	}

	// Upload attachments (outside any tx).
	let prepared: PreparedAttachment[] = [];
	const skipped: { filename: string; reason: string }[] = [];
	if (rawAttachments.length > 0) {
		try {
			const out = await prepareInboundAttachments({
				orgId: match.orgId,
				conversationId,
				attachments: rawAttachments
			});
			prepared = out.prepared;
			skipped.push(...out.skipped);
		} catch (err) {
			log.error({
				phase: 'attachment_upload_failed',
				svix_id: svixId,
				error: err instanceof Error ? err.message : String(err)
			});
			// Continue without attachments — we still want the body in the timeline.
		}
	}

	const subject = data.subject?.toString().trim() || null;
	const refsForStorage = refsRaw?.toString() ?? null;
	const inReplyToForStorage = inReplyTo?.toString() ?? null;
	const providerMessageId = messageIdHeader
		? messageIdHeader.replace(/^<|>$/g, '')
		: null;

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
				orgId: match.orgId,
				conversationId,
				channel: 'email',
				body,
				source: 'resend_inbound',
				emailMeta: {
					email_provider: 'resend',
					email_provider_message_id: providerMessageId ?? undefined,
					email_subject: subject ?? undefined,
					email_from_address: from?.address ?? undefined,
					email_to_addresses: toAndCc
						.filter((a) =>
							normalizeList(data.to)
								.map((b) => b.address)
								.includes(a.address)
						)
						.map((a) => a.address),
					email_cc_addresses: normalizeList(data.cc).map((a) => a.address),
					email_in_reply_to: inReplyToForStorage ?? undefined,
					email_references: refsForStorage ?? undefined
				}
			});

			if (prepared.length > 0) {
				await tx.insert(media).values(
					prepared.map((p) => ({
						org_id: match.orgId,
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
				org_id: match.orgId,
				event_type: 'message.received',
				resource_type: 'message',
				resource_id: inserted.id,
				payload: {
					message_id: inserted.id,
					conversation_id: conversationId,
					contact_id: match.contactId,
					org_id: match.orgId,
					channel: 'email',
					body,
					email_subject: subject,
					email_from_address: from?.address ?? null,
					email_provider_message_id: providerMessageId,
					matched_by: match.matchedBy,
					is_new_conversation: createdConversation,
					attachment_count: prepared.length,
					skipped_attachment_count: skipped.length
				},
				idempotency_key: `message.received:${inserted.id}`
			});
		});

		void touchContactLastContacted(match.orgId, match.contactId);

		await recordAudit({
			orgId: match.orgId,
			svixId,
			eventType: event.type ?? 'email.received',
			payload: event
		});

		if (skipped.length) {
			log.info({
				phase: 'attachments_skipped',
				svix_id: svixId,
				org_id: match.orgId,
				skipped
			});
		}
	} catch (err) {
		// Intentionally do NOT write the audit row on failure — the audit row is
		// the idempotency marker. Skipping it lets Resend retry the webhook and
		// hit the success path next time.
		log.error({
			phase: 'persist_failed',
			svix_id: svixId,
			org_id: match.orgId,
			error: err instanceof Error ? err.message : String(err)
		});
		throw err;
	}
}

// Re-export for tests
export { parseAddresses, parseMessageIds };
