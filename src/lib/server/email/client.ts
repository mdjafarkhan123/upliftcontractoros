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

export type EmailAttachment = {
	filename: string;
	content: Buffer;
	contentType?: string;
};

export type SendEmailInput = {
	to: string;
	from: string;
	subject: string;
	html: string;
	text: string;
	replyTo?: string;
	headers?: Record<string, string>;
	attachments?: EmailAttachment[];
	tags?: { name: string; value: string }[];
};

export type SendEmailResult = {
	id: string | null;
};

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
	const res = await resend().emails.send({
		to: input.to,
		from: input.from,
		subject: input.subject,
		html: input.html,
		text: input.text,
		replyTo: input.replyTo,
		headers: input.headers,
		attachments: input.attachments?.map((a) => ({
			filename: a.filename,
			content: a.content,
			contentType: a.contentType
		})),
		tags: input.tags
	});
	if (res.error) throw new Error(res.error.message);
	return { id: res.data?.id ?? null };
}
