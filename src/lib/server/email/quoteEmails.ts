import { sendEmail, type SendEmailResult } from './client';
import { contractorFromAddress } from './senderAddresses';

function escapeHtml(s: string): string {
	return s
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');
}

export type QuoteEmailVars = {
	org: { name: string; slug: string; email_sender_local: string | null };
	contactName: string;
	contactEmail: string;
	quoteNumber: string;
	totalFormatted: string;
	publicUrl: string;
	isResend: boolean;
};

function quoteHtml(v: QuoteEmailVars): string {
	const greeting = v.isResend ? 'Here is your updated quote' : 'Your quote is ready';
	return `<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f6f7f9;margin:0;padding:24px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.04);">
    <tr><td style="padding:32px 28px 8px;">
      <p style="margin:0;color:#6b7280;font-size:13px;">${escapeHtml(v.org.name)}</p>
      <h1 style="margin:8px 0 0;font-size:22px;color:#0f172a;">${escapeHtml(greeting)}</h1>
    </td></tr>
    <tr><td style="padding:16px 28px 8px;color:#334155;font-size:15px;line-height:1.5;">
      <p style="margin:0 0 12px;">Hi ${escapeHtml(v.contactName)},</p>
      <p style="margin:0 0 12px;">${escapeHtml(v.isResend ? 'We\'ve updated your quote' : 'Thanks for the opportunity to work with you')}. You can review the full details below.</p>
      <p style="margin:0 0 12px;"><strong>Quote ${escapeHtml(v.quoteNumber)}</strong> &middot; ${escapeHtml(v.totalFormatted)}</p>
    </td></tr>
    <tr><td style="padding:16px 28px 32px;">
      <a href="${escapeHtml(v.publicUrl)}" style="display:inline-block;background:#0f172a;color:#fff;text-decoration:none;padding:14px 22px;border-radius:8px;font-weight:600;">View quote</a>
    </td></tr>
    <tr><td style="padding:0 28px 28px;color:#94a3b8;font-size:12px;">
      <p style="margin:0;">If the button doesn't work, paste this link into your browser:<br><span style="color:#475569;word-break:break-all;">${escapeHtml(v.publicUrl)}</span></p>
    </td></tr>
  </table>
</body></html>`;
}

function quoteText(v: QuoteEmailVars): string {
	const greeting = v.isResend ? 'Here is your updated quote' : 'Your quote is ready';
	return `${greeting}

Hi ${v.contactName},

${v.org.name} has ${v.isResend ? 'updated your quote' : 'sent you a quote'}.

Quote ${v.quoteNumber} — ${v.totalFormatted}

View your quote:
${v.publicUrl}
`;
}

export async function sendQuoteEmail(vars: QuoteEmailVars): Promise<SendEmailResult> {
	const subject = vars.isResend
		? `Updated quote ${vars.quoteNumber} from ${vars.org.name}`
		: `Your quote ${vars.quoteNumber} from ${vars.org.name}`;
	return sendEmail({
		to: vars.contactEmail,
		from: contractorFromAddress(vars.org),
		subject,
		html: quoteHtml(vars),
		text: quoteText(vars),
		tags: [{ name: 'channel', value: 'quote' }]
	});
}
