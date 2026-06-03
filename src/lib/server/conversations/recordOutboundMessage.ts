import { messages, type Message, type NewMessage } from '$lib/server/db/schema';
import { touchConversationOnMessage } from './touchConversationOnMessage';
import type { db } from '$lib/server/db/client';

type Db = typeof db;
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
type DbOrTx = Db | Tx;

type EmailMeta = {
	email_provider?: string;
	email_provider_message_id?: string;
	email_subject?: string;
	email_from_address?: string;
	email_to_addresses?: string[];
	email_cc_addresses?: string[];
	email_in_reply_to?: string;
	email_references?: string;
};

export type RecordOutboundMessageInput = {
	orgId: string;
	conversationId: string;
	channel: Message['channel'];
	body: string | null;
	sentBy: string | null;
	status?: Message['status'];
	isInternalNote?: boolean;
	twilioMessageSid?: string | null;
	emailMeta?: EmailMeta;
	source: string;
	sentAt?: Date;
	mediaUrls?: string[] | null;
	replyToMessageId?: string | null;
	/** True when the message carries media — drives the "📷 Photo" inbox preview. */
	hasMedia?: boolean;
};

/**
 * Insert an outbound message and bump conversation operational metadata in the
 * same transaction. Caller is responsible for emitting message.sent outbox
 * events (or skipping them for internal notes / transport-failed sends).
 *
 * Internal notes:
 *   - Persist as messages rows with is_internal_note=true
 *   - Do not affect last_message_channel / last_message_direction / unread state
 *     (touchConversationOnMessage handles that contract)
 *   - Never trigger external delivery — that decision lives at the call site.
 */
export async function recordOutboundMessage(
	tx: DbOrTx,
	input: RecordOutboundMessageInput
): Promise<Message> {
	const sentAt = input.sentAt ?? new Date();
	const isInternalNote = input.isInternalNote ?? false;

	const values: NewMessage = {
		org_id: input.orgId,
		conversation_id: input.conversationId,
		direction: 'outbound',
		channel: input.channel,
		body: input.body,
		is_internal_note: isInternalNote,
		status: input.status ?? 'sent',
		twilio_message_sid: input.twilioMessageSid ?? undefined,
		media_urls: input.mediaUrls ?? undefined,
		reply_to_message_id: input.replyToMessageId ?? undefined,
		source: input.source,
		sent_by: input.sentBy,
		sent_at: sentAt,
		...(input.emailMeta ?? {})
	};

	const [inserted] = await tx.insert(messages).values(values).returning();

	await touchConversationOnMessage(
		tx,
		{
			conversation_id: input.conversationId,
			channel: input.channel,
			direction: 'outbound',
			body: input.body,
			is_internal_note: isInternalNote,
			hasMedia: input.hasMedia ?? false
		},
		sentAt
	);

	return inserted;
}
