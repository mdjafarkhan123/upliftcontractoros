import { twilio } from './client';

export async function sendSms(
	orgPhone: string,
	contactPhone: string,
	body: string
): Promise<string | null> {
	const res = await twilio().messages.create({ from: orgPhone, to: contactPhone, body });
	return res.sid ?? null;
}
