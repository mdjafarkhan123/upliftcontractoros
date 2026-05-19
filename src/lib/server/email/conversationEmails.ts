import { sendEmail, type EmailAttachment } from './client';
import { contractorFromAddress } from './senderAddresses';

const env = process.env;

function escapeHtml(s: string): string {
	return s
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');
}

/**
 * Opaque reply-to address. Format: <r_xxxxxxxxxxxx>@<EMAIL_REPLY_DOMAIN>.
 * The alias is a per-conversation token from conversations.reply_alias —
 * caller is responsible for ensuring one exists (ensureReplyAlias()).
 *
 * Inbound webhooks look up conversations by alias scoped to org. No internal
 * IDs ever leak to the recipient's mail headers.
 */
export function replyToAddress(replyAlias: string): string {
	const domain = env.EMAIL_REPLY_DOMAIN;
	if (!domain) throw new Error('EMAIL_REPLY_DOMAIN is required to send conversation email.');
	return `${replyAlias}@${domain}`;
}

export type ConversationEmailOrg = {
	name: string;
	slug: string;
	email_sender_local: string | null;
};

export type SendConversationEmailInput = {
	org: ConversationEmailOrg;
	replyAlias: string;
	to: string;
	subject: string;
	body: string;
	inReplyTo?: string | null;
	references?: string | null;
	attachments?: EmailAttachment[];
	messageId?: string;
};

export type SendConversationEmailResult = {
	provider: 'resend';
	providerMessageId: string | null;
	fromAddress: string;
	replyToAddress: string;
};

function bodyHtml(body: string): string {
	const paragraphs = body
		.split(/\n{2,}/)
		.map((p) => `<p style="margin:0 0 12px;white-space:pre-wrap;">${escapeHtml(p)}</p>`)
		.join('');
	return `<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f6f7f9;margin:0;padding:24px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.04);">
    <tr><td style="padding:28px;color:#334155;font-size:15px;line-height:1.55;">
      ${paragraphs}
    </td></tr>
  </table>
</body></html>`;
}

export async function sendConversationEmail(
	input: SendConversationEmailInput
): Promise<SendConversationEmailResult> {
	const fromAddress = contractorFromAddress(input.org);
	const reply = replyToAddress(input.replyAlias);

	const headers: Record<string, string> = {};
	if (input.inReplyTo) headers['In-Reply-To'] = input.inReplyTo;
	if (input.references) headers['References'] = input.references;

	const tags: { name: string; value: string }[] = [{ name: 'channel', value: 'conversation' }];
	if (input.messageId) tags.push({ name: 'message_id', value: input.messageId });

	const { id } = await sendEmail({
		to: input.to,
		from: fromAddress,
		subject: input.subject,
		html: bodyHtml(input.body),
		text: input.body,
		replyTo: reply,
		...(Object.keys(headers).length ? { headers } : {}),
		...(input.attachments?.length ? { attachments: input.attachments } : {}),
		tags
	});

	return {
		provider: 'resend',
		providerMessageId: id,
		fromAddress,
		replyToAddress: reply
	};
}
