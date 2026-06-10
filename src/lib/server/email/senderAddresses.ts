import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { platformSettings } from '$lib/server/db/schema';

const env = process.env;

// Short cache so high-frequency system sends don't re-query platform_settings on
// every call. After the PO verifies the domain in /jafar, switchover lags by at
// most this TTL. Per-process (web + worker each cache independently).
const SYSTEM_FROM_CACHE_TTL_MS = 60_000;
let systemFromCache: { value: string; expiresAt: number } | null = null;

function escapeDisplayName(name: string): string {
	// RFC 5322 phrase: quote if it contains specials, escape backslash and quote.
	if (/^[A-Za-z0-9 .\-_']+$/.test(name)) return name;
	return `"${name.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function sanitizeLocalPart(raw: string): string {
	const sanitised = raw
		.toLowerCase()
		.replace(/[^a-z0-9-]+/g, '-')
		.replace(/^-+|-+$/g, '');
	return sanitised || 'mail';
}

function localPart(org: { email_sender_local: string | null; slug: string }): string {
	return sanitizeLocalPart(org.email_sender_local ?? org.slug);
}

/**
 * The org's DEFAULT sending local-part — organizations.email_sender_local, or a
 * sanitized slug fallback. Exported so the email-settings API can reject an extra
 * address that would collide with the default (the default is not stored in the
 * email_sender_addresses table).
 */
export function defaultLocalPart(org: { email_sender_local: string | null; slug: string }): string {
	return localPart(org);
}

/**
 * Contractor-branded From address used for all customer-facing email
 * (conversations, quotes, invoices). Each org sends from its own Brevo-verified
 * sending domain (email_domains.domain); per-org local-part.
 *
 *   "Acme Roofing" <acme-roofing@mail.acmeroofing.com>
 *
 * Pass `overrideLocalPart` to send from one of the org's extra branded addresses
 * (email_sender_addresses) instead of the default — the caller is responsible for
 * validating it is the default or one of the org's extras. The value is sanitized
 * here with the same rules as the default so a malformed local-part can never be
 * placed in the From header.
 */
export function contractorFromAddress(
	org: {
		name: string;
		slug: string;
		email_sender_local: string | null;
	},
	sendingDomain: string,
	overrideLocalPart?: string | null
): string {
	const local = overrideLocalPart ? sanitizeLocalPart(overrideLocalPart) : localPart(org);
	return `${escapeDisplayName(org.name)} <${local}@${sendingDomain}>`;
}

/**
 * Platform/system From address — never used for customer communication.
 * For password resets, super-admin notifications, billing receipts, etc.
 *
 * Prefers the PO-managed system email domain (platform_settings) once it is
 * verified in /jafar, composing `"${from_name}" <${from_local}@${domain}>`.
 * Falls back to the SYSTEM_FROM_EMAIL env value while no domain is verified (or
 * if the DB is unreachable), so system mail keeps flowing during setup.
 */
export async function systemFromAddress(): Promise<string> {
	const now = Date.now();
	if (systemFromCache && systemFromCache.expiresAt > now) return systemFromCache.value;

	let resolved: string | null = null;
	try {
		const [row] = await db
			.select({
				status: platformSettings.system_email_status,
				domain: platformSettings.system_email_domain,
				local: platformSettings.system_email_from_local,
				name: platformSettings.system_email_from_name
			})
			.from(platformSettings)
			.where(eq(platformSettings.id, 'global'))
			.limit(1);
		if (row?.status === 'verified' && row.domain) {
			const address = `${row.local || 'noreply'}@${row.domain}`;
			resolved = row.name ? `${escapeDisplayName(row.name)} <${address}>` : address;
		}
	} catch {
		// DB unreachable — fall back to env below.
	}

	if (!resolved) {
		const from = env.SYSTEM_FROM_EMAIL;
		if (!from) {
			throw new Error('No verified platform email domain and SYSTEM_FROM_EMAIL is not set.');
		}
		resolved = from;
	}

	systemFromCache = { value: resolved, expiresAt: now + SYSTEM_FROM_CACHE_TTL_MS };
	return resolved;
}
