import { randomBytes } from 'node:crypto';

// Forwarding round-trip verification (Stage 1.3).
//
// The contractor sends a coded email to the inbox they configured forwarding on.
// If their forward rule works the email returns through Brevo inbound; the inbound
// processor matches the marker BEFORE any correlation/lead logic and flips the
// test to 'passed'. The marker is embedded in BOTH the subject and the body so it
// survives a `Fwd:`/`FW:` subject prefix and any client that rewrites the subject.

const MARKER_PREFIX = 'FWD-VERIFY';

// Opaque, URL-safe token. 18 random bytes → 24 base64url chars. Crypto-strong;
// never derived from org data. base64url alphabet is [A-Za-z0-9_-].
export function generateForwardTestToken(): string {
	return randomBytes(18).toString('base64url');
}

/** The literal marker placed in the subject + body, e.g. `[[FWD-VERIFY:abc123]]`. */
export function forwardVerifyMarker(token: string): string {
	return `[[${MARKER_PREFIX}:${token}]]`;
}

const MARKER_RE = new RegExp(`\\[\\[${MARKER_PREFIX}:([A-Za-z0-9_-]+)\\]\\]`);

/** Extract the verification token from a subject or body, or null if absent. */
export function extractForwardTestToken(text: string | null | undefined): string | null {
	if (!text) return null;
	const m = MARKER_RE.exec(text);
	return m ? m[1] : null;
}

function escapeHtml(s: string): string {
	return s
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');
}

/**
 * Build the verification email. Recipient is the contractor's own inbox, never a
 * customer — copy is plain and reassuring (no action required). The marker rides
 * the subject and a footer line so the inbound processor can detect the round-trip.
 */
export function buildForwardVerificationEmail(args: { orgName: string; token: string }): {
	subject: string;
	text: string;
	html: string;
} {
	const marker = forwardVerifyMarker(args.token);
	const subject = `Confirming your email forwarding ${marker}`;

	const text = [
		`This is a test from ${args.orgName}'s CRM to confirm email forwarding is set up correctly.`,
		'',
		'If you set up forwarding, this message will arrive back in your CRM inbox and the',
		'"Verify forwarding" step will turn green automatically. No action is needed.',
		'',
		`Verification code: ${marker}`
	].join('\n');

	const html = `<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f6f7f9;margin:0;padding:24px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.04);">
    <tr><td style="padding:28px;color:#334155;font-size:15px;line-height:1.55;">
      <p style="margin:0 0 12px;">This is a test from <strong>${escapeHtml(args.orgName)}</strong>'s CRM to confirm email forwarding is set up correctly.</p>
      <p style="margin:0 0 12px;">If you set up forwarding, this message will arrive back in your CRM inbox and the &ldquo;Verify forwarding&rdquo; step will turn green automatically. No action is needed.</p>
      <p style="margin:16px 0 0;color:#94a3b8;font-size:13px;">Verification code: ${escapeHtml(marker)}</p>
    </td></tr>
  </table>
</body></html>`;

	return { subject, text, html };
}
