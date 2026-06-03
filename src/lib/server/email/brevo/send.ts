import { brevoFetch } from './request';
import { parseAddresses } from '../inboundCorrelation';

// Transactional send via Brevo. Mirrors the shape the rest of the app already
// uses (see SendEmailInput in ../client.ts) so callers don't change.
export type BrevoSendInput = {
	to: string;
	from: string;
	subject: string;
	html: string;
	text: string;
	replyTo?: string;
	headers?: Record<string, string>;
	attachments?: { filename: string; content: Buffer; contentType?: string }[];
	tags?: { name: string; value: string }[];
};

export type BrevoSendResult = {
	messageId: string | null;
};

type BrevoMailbox = { email: string; name?: string };

// Turn a header string like `"Acme Roofing" <jobs@mail.acme.com>` into Brevo's
// { email, name } object. Falls back to treating the whole string as an address.
function toMailbox(raw: string): BrevoMailbox {
	const parsed = parseAddresses(raw)[0];
	if (parsed) {
		return parsed.name ? { email: parsed.address, name: parsed.name } : { email: parsed.address };
	}
	return { email: raw.trim() };
}

type BrevoSendBody = {
	sender: BrevoMailbox;
	to: BrevoMailbox[];
	replyTo?: BrevoMailbox;
	subject: string;
	htmlContent: string;
	textContent: string;
	headers?: Record<string, string>;
	attachment?: { name: string; content: string }[];
	tags?: string[];
};

type BrevoSendResponse = { messageId?: string; messageIds?: string[] };

export async function sendBrevoEmail(input: BrevoSendInput): Promise<BrevoSendResult> {
	const body: BrevoSendBody = {
		sender: toMailbox(input.from),
		to: [toMailbox(input.to)],
		subject: input.subject,
		htmlContent: input.html,
		textContent: input.text
	};

	if (input.replyTo) body.replyTo = toMailbox(input.replyTo);
	if (input.headers && Object.keys(input.headers).length) body.headers = input.headers;
	if (input.attachments?.length) {
		body.attachment = input.attachments.map((a) => ({
			name: a.filename,
			content: a.content.toString('base64')
		}));
	}
	// Brevo tags are flat strings; we only carry the values we tag with.
	if (input.tags?.length) body.tags = input.tags.map((t) => t.value);

	const data = await brevoFetch<BrevoSendResponse>('/smtp/email', { method: 'POST', body });
	return { messageId: data.messageId ?? data.messageIds?.[0] ?? null };
}
