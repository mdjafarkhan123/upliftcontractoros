import { twilioFor } from './client';

export type SendSmsOptions = {
	statusCallback?: string;
	/** Publicly-fetchable media URLs for an outbound MMS (max 10). */
	mediaUrl?: string[];
	/**
	 * Subaccount SID that owns `orgPhone`. When set, the message is sent as that
	 * subaccount; when null/undefined it goes through the master account (legacy
	 * master-owned numbers).
	 */
	subaccountSid?: string | null;
};

export async function sendSms(
	orgPhone: string,
	contactPhone: string,
	body: string,
	options: SendSmsOptions = {}
): Promise<string | null> {
	const res = await twilioFor(options.subaccountSid).messages.create({
		from: orgPhone,
		to: contactPhone,
		body,
		...(options.statusCallback ? { statusCallback: options.statusCallback } : {}),
		...(options.mediaUrl && options.mediaUrl.length > 0 ? { mediaUrl: options.mediaUrl } : {})
	});
	return res.sid ?? null;
}
