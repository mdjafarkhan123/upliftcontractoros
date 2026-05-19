import { twilio } from './client';

export type SendSmsOptions = {
	statusCallback?: string;
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
		...(options.statusCallback ? { statusCallback: options.statusCallback } : {})
	});
	return res.sid ?? null;
}
