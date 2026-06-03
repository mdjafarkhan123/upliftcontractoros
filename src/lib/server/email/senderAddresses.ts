const env = process.env;

function escapeDisplayName(name: string): string {
	// RFC 5322 phrase: quote if it contains specials, escape backslash and quote.
	if (/^[A-Za-z0-9 .\-_']+$/.test(name)) return name;
	return `"${name.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function localPart(org: { email_sender_local: string | null; slug: string }): string {
	const raw = org.email_sender_local ?? org.slug;
	const sanitised = raw
		.toLowerCase()
		.replace(/[^a-z0-9-]+/g, '-')
		.replace(/^-+|-+$/g, '');
	return sanitised || 'mail';
}

/**
 * Contractor-branded From address used for all customer-facing email
 * (conversations, quotes, invoices). Each org sends from its own Brevo-verified
 * sending domain (email_domains.domain); per-org local-part.
 *
 *   "Acme Roofing" <acme-roofing@mail.acmeroofing.com>
 */
export function contractorFromAddress(
	org: {
		name: string;
		slug: string;
		email_sender_local: string | null;
	},
	sendingDomain: string
): string {
	return `${escapeDisplayName(org.name)} <${localPart(org)}@${sendingDomain}>`;
}

/**
 * Platform/system From address — never used for customer communication.
 * For password resets, super-admin notifications, billing receipts, etc.
 */
export function systemFromAddress(): string {
	const from = env.SYSTEM_FROM_EMAIL;
	if (!from) throw new Error('SYSTEM_FROM_EMAIL is required.');
	return from;
}
