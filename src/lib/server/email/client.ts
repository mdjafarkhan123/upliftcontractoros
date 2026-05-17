import { Resend } from 'resend';
const env = process.env;

let _client: Resend | null = null;

export function resend(): Resend {
	if (_client) return _client;
	const key = env.RESEND_API_KEY;
	if (!key) throw new Error('RESEND_API_KEY is required.');
	_client = new Resend(key);
	return _client;
}

export function defaultFromAddress(orgName: string): string {
	const from = env.RESEND_FROM_EMAIL;
	if (!from) throw new Error('RESEND_FROM_EMAIL is required.');
	return `${orgName} <${from}>`;
}

export type SendEmailInput = {
	to: string;
	from: string;
	subject: string;
	html: string;
	text: string;
	replyTo?: string;
};

export async function sendEmail(input: SendEmailInput): Promise<{ id: string | null }> {
	const res = await resend().emails.send({
		to: input.to,
		from: input.from,
		subject: input.subject,
		html: input.html,
		text: input.text,
		replyTo: input.replyTo
	});
	if (res.error) throw new Error(res.error.message);
	return { id: res.data?.id ?? null };
}
