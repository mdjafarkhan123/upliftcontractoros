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

export type RecordInboundMessageInput = {
	orgId: string;
	conversationId: string;
	channel: Message['channel'];
	body: string | null;
	status?: Message['status'];
	twilioMessageSid?: string | null;
	emailMeta?: EmailMeta;
	source: string;
	sentAt?: Date;
	mediaUrls?: string[] | null;
	/** True when the message carries media — drives the "📷 Photo" inbox preview. */
	hasMedia?: boolean;
};

/**
 * Insert an inbound message and bump conversation operational metadata in the
 * same transaction. Caller is responsible for emitting any outbox events
 * (message.received, call.missed, etc.) since payload shapes vary by channel.
 *
 * Inbound activity always updates unread_count + last_inbound_at via
 * touchConversationOnMessage. Internal notes never flow through here.
 */
export async function recordInboundMessage(
	tx: DbOrTx,
	input: RecordInboundMessageInput
): Promise<Message> {
	const sentAt = input.sentAt ?? new Date();

	const values: NewMessage = {
		org_id: input.orgId,
		conversation_id: input.conversationId,
		direction: 'inbound',
		channel: input.channel,
		body: input.body,
		is_internal_note: false,
		status: input.status ?? 'received',
		twilio_message_sid: input.twilioMessageSid ?? undefined,
		media_urls: input.mediaUrls ?? undefined,
		source: input.source,
		sent_at: sentAt,
		...(input.emailMeta ?? {})
	};

	const [inserted] = await tx.insert(messages).values(values).returning();

	await touchConversationOnMessage(
		tx,
		{
			conversation_id: input.conversationId,
			channel: input.channel,
			direction: 'inbound',
			body: input.body,
			is_internal_note: false,
			hasMedia: input.hasMedia ?? false
		},
		sentAt
	);

	return inserted;
}
