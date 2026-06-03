import { twilio } from './client';

export type SendSmsOptions = {
	statusCallback?: string;
	/** Publicly-fetchable media URLs for an outbound MMS (max 10). */
	mediaUrl?: string[];
};

export async function sendSms(
	orgPhone: string,
	contactPhone: string,
	body: string,
	options: SendSmsOptions = {}
): Promise<string | null> {
	const res = await twilio().messages.create({
		from: orgPhone,
		to: contactPhone,
		body,
		...(options.statusCallback ? { statusCallback: options.statusCallback } : {}),
		...(options.mediaUrl && options.mediaUrl.length > 0 ? { mediaUrl: options.mediaUrl } : {})
	});
	return res.sid ?? null;
}
