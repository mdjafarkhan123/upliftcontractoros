import { sendBrevoEmail } from './brevo/send';

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

/**
 * Provider-neutral email send. Backed by Brevo's transactional API. The returned
 * `id` is Brevo's messageId, stored on messages.email_provider_message_id and
 * matched back by the delivery-events webhook.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
	const { messageId } = await sendBrevoEmail({
		to: input.to,
		from: input.from,
		subject: input.subject,
		html: input.html,
		text: input.text,
		replyTo: input.replyTo,
		headers: input.headers,
		attachments: input.attachments,
		tags: input.tags
	});
	return { id: messageId };
}
