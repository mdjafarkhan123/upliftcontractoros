import { sendEmail, type SendEmailResult } from './client';
import { systemFromAddress } from './senderAddresses';

export type SendSystemEmailInput = {
	to: string;
	subject: string;
	html: string;
	text: string;
};

/**
 * Platform/system email — password reset, admin notifications, billing.
 * Strictly isolated from contractor↔customer communication. Never used for
 * conversation messages, quotes, invoices, review requests, etc.
 */
export async function sendSystemEmail(input: SendSystemEmailInput): Promise<SendEmailResult> {
	return sendEmail({
		from: systemFromAddress(),
		to: input.to,
		subject: input.subject,
		html: input.html,
		text: input.text,
		tags: [{ name: 'channel', value: 'system' }]
	});
}
