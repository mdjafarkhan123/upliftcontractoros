import { telnyxApiKey } from './client';

export type TelnyxSendResult = {
	messageId: string;
};

/**
 * Send an outbound SMS via Telnyx REST API.
 * Returns the Telnyx message ID (stored in messages.twilio_message_sid for idempotency).
 */
export async function sendSmsTelnyx(
	from: string,
	to: string,
	text: string
): Promise<TelnyxSendResult> {
	const res = await fetch('https://api.telnyx.com/v2/messages', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${telnyxApiKey()}`
		},
		body: JSON.stringify({ from, to, text, type: 'SMS' })
	});

	if (!res.ok) {
		const body = await res.text().catch(() => '');
		throw new Error(`Telnyx send failed: ${res.status} ${body}`);
	}

	const json = (await res.json()) as { data: { id: string } };
	return { messageId: json.data.id };
}
