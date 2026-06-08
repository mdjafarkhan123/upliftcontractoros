import { telnyxApiKey } from './client';

const env = process.env;

export type SendSmsTelnyxOptions = {
	/** Publicly-fetchable media URLs for an outbound MMS (Telnyx `media_urls`). */
	mediaUrls?: string[];
	/**
	 * Unique reference echoed back on webhooks. We pass the internal message id so
	 * a retried POST is de-duplicated by Telnyx and never double-sent/double-billed
	 * (Blueprint §Idempotency).
	 */
	clientReferenceId?: string;
};

export type TelnyxSendResult = {
	messageId: string;
};

/**
 * Send an outbound SMS/MMS via the Telnyx Messages API.
 *
 * `from` is the org's provisioned Telnyx number — the messaging profile is
 * resolved from it, so `messaging_profile_id` is only sent when
 * TELNYX_MESSAGING_PROFILE_ID is explicitly configured. Passing `media_urls`
 * promotes the message to MMS. Delivery status is delivered via the messaging
 * profile's global webhook (handled at /api/webhooks/telnyx), not per-message.
 *
 * Returns the Telnyx message ID (stored in messages.twilio_message_sid — column
 * name intentionally unchanged — for status/idempotency correlation).
 */
export async function sendSmsTelnyx(
	from: string,
	to: string,
	text: string,
	options: SendSmsTelnyxOptions = {}
): Promise<TelnyxSendResult> {
	const profileId = env.TELNYX_MESSAGING_PROFILE_ID?.trim();
	const hasMedia = !!options.mediaUrls && options.mediaUrls.length > 0;

	const body: Record<string, unknown> = {
		from,
		to,
		text,
		type: hasMedia ? 'MMS' : 'SMS',
		...(hasMedia ? { media_urls: options.mediaUrls } : {}),
		...(options.clientReferenceId ? { client_reference_id: options.clientReferenceId } : {}),
		...(profileId ? { messaging_profile_id: profileId } : {})
	};

	const res = await fetch('https://api.telnyx.com/v2/messages', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${telnyxApiKey()}`
		},
		body: JSON.stringify(body)
	});

	if (!res.ok) {
		const errBody = await res.text().catch(() => '');
		throw new Error(`Telnyx send failed: ${res.status} ${errBody}`);
	}

	const json = (await res.json()) as { data: { id: string } };
	return { messageId: json.data.id };
}
