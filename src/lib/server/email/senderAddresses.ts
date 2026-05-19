const env = process.env;

function apexDomain(): string {
	const apex = env.EMAIL_APEX_DOMAIN;
	if (!apex) {
		throw new Error('EMAIL_APEX_DOMAIN is required for contractor outbound email.');
	}
	return apex;
}

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
 * (conversations, quotes, invoices). Shared verified apex; per-org local-part.
 *
 *   "Acme Roofing" <acme-roofing@mail.platform.com>
 */
export function contractorFromAddress(
	org: { name: string; slug: string; email_sender_local: string | null }
): string {
	return `${escapeDisplayName(org.name)} <${localPart(org)}@${apexDomain()}>`;
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

export function contractorEmailDomain(): string {
	return apexDomain();
}
