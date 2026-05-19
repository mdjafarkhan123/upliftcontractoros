import { eq, sql } from 'drizzle-orm';
import { conversations, type Message } from '$lib/server/db/schema';
import type { db } from '$lib/server/db/client';

type Db = typeof db;
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
type DbOrTx = Db | Tx;

const PREVIEW_LIMIT = 140;

function buildPreview(channel: Message['channel'], body: string | null): string {
	if (channel === 'missed_call') return 'Missed phone call';
	if (!body) return '';
	const trimmed = body.trim();
	return trimmed.length > PREVIEW_LIMIT ? trimmed.slice(0, PREVIEW_LIMIT) : trimmed;
}

type TouchInput = Pick<
	Message,
	'conversation_id' | 'channel' | 'direction' | 'body' | 'is_internal_note'
>;

/**
 * Bump conversation operational metadata after a message is persisted.
 *
 * Internal notes update only last_message_at — they are not customer-facing
 * communication and never adjust channel/direction/unread state.
 *
 * For real messages:
 *  - Always updates last_message_at, last_message_preview, last_message_channel,
 *    last_message_direction.
 *  - Inbound: increments unread_count, sets last_inbound_at, plus last_inbound_email_at when email.
 *  - Outbound: sets last_outbound_at, plus last_outbound_email_at when email.
 *  - Outbound also sets first_response_at on the first outbound that follows
 *    any inbound (if not already set).
 *
 * Caller is responsible for executing this inside the same transaction that
 * inserted the message so the snapshot stays consistent.
 */
export async function touchConversationOnMessage(
	dbOrTx: DbOrTx,
	message: TouchInput,
	now: Date = new Date()
): Promise<void> {
	if (message.is_internal_note) {
		await dbOrTx
			.update(conversations)
			.set({ last_message_at: now, updated_at: now })
			.where(eq(conversations.id, message.conversation_id));
		return;
	}

	const preview = buildPreview(message.channel, message.body);
	const isInbound = message.direction === 'inbound';
	const isEmail = message.channel === 'email';

	if (isInbound) {
		await dbOrTx
			.update(conversations)
			.set({
				last_message_at: now,
				last_message_preview: preview,
				last_message_channel: message.channel,
				last_message_direction: 'inbound',
				last_inbound_at: now,
				last_inbound_email_at: isEmail ? now : undefined,
				unread_count: sql`${conversations.unread_count} + 1`,
				updated_at: now
			})
			.where(eq(conversations.id, message.conversation_id));
		return;
	}

	await dbOrTx
		.update(conversations)
		.set({
			last_message_at: now,
			last_message_preview: preview,
			last_message_channel: message.channel,
			last_message_direction: 'outbound',
			last_outbound_at: now,
			last_outbound_email_at: isEmail ? now : undefined,
			first_response_at: sql`
				CASE
					WHEN ${conversations.first_response_at} IS NULL
					 AND ${conversations.last_inbound_at} IS NOT NULL
					THEN ${now}
					ELSE ${conversations.first_response_at}
				END
			`,
			updated_at: now
		})
		.where(eq(conversations.id, message.conversation_id));
}
