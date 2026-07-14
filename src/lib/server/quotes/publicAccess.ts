import { createHash } from 'crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import {
	contactAddresses,
	contacts,
	orgMembers,
	organizations,
	quotes
} from '$lib/server/db/schema';
import { constantTimeEqualHex, hashToken } from './token';
import type { QuoteServiceAddress } from '$lib/types/quotes';

export type ValidQuoteRow = {
	id: string;
	org_id: string;
	contact_id: string;
	contact_name: string;
	contact_phone: string;
	org_name: string;
	org_logo_url: string | null;
	org_primary_color: string | null;
	org_tagline: string | null;
	// Business signature block (org-level). image_url here is the raw R2 key — the
	// public data route resolves it to a signed URL.
	org_signature_block_enabled: boolean;
	org_signature_name: string | null;
	org_signature_title: string | null;
	org_signature_statement: string | null;
	org_signature_image_url: string | null;
	issued_by_name: string | null;
	service_address: QuoteServiceAddress | null;
	quote_number: number;
	title: string;
	status: 'draft' | 'sent' | 'viewed' | 'accepted' | 'declined' | 'expired' | 'changes_requested';
	current_version: number;
	subtotal: string;
	discount_type: string;
	discount_value: string | null;
	discount_amount: string | null;
	discount_label: string | null;
	tax_rate: string;
	tax_amount: string;
	total: string;
	deposit_required: boolean;
	deposit_type: string;
	deposit_percent: string | null;
	deposit_amount: string | null;
	deposit_paid_amount: number;
	deposit_paid_at: Date | null;
	notes: string | null;
	terms: string | null;
	viewed_at: Date | null;
	expires_at: Date | null;
	// Good-Better-Best: which tier the customer accepted (null until accepted / on simple
	// quotes) plus the frozen accepted figures, so the read-only accepted view can name the
	// chosen package and show its final total.
	accepted_package_id: string | null;
	accepted_subtotal: string | null;
	accepted_tax_amount: string | null;
	accepted_total: string | null;
};

export type LookupResult = { ok: true; quote: ValidQuoteRow } | { ok: false };

export async function lookupValidQuoteByToken(rawToken: string): Promise<LookupResult> {
	if (!rawToken || rawToken.length < 16) return { ok: false };
	const hash = hashToken(rawToken);
	const [row] = await db
		.select({
			id: quotes.id,
			org_id: quotes.org_id,
			contact_id: quotes.contact_id,
			contact_name: contacts.full_name,
			contact_phone: contacts.phone,
			org_name: organizations.name,
			org_logo_url: organizations.logo_url,
			org_primary_color: organizations.primary_color,
			org_tagline: organizations.tagline,
			org_signature_block_enabled: organizations.signature_block_enabled,
			org_signature_name: organizations.signature_name,
			org_signature_title: organizations.signature_title,
			org_signature_statement: organizations.signature_statement,
			org_signature_image_url: organizations.signature_image_url,
			issued_by_name: orgMembers.full_name,
			service_address_id: quotes.service_address_id,
			addr_label: contactAddresses.label,
			addr_line_1: contactAddresses.address_line_1,
			addr_line_2: contactAddresses.address_line_2,
			addr_city: contactAddresses.city,
			addr_state: contactAddresses.state,
			addr_zip: contactAddresses.zip,
			quote_number: quotes.quote_number,
			title: quotes.title,
			status: quotes.status,
			current_version: quotes.current_version,
			subtotal: quotes.subtotal,
			discount_type: quotes.discount_type,
			discount_value: quotes.discount_value,
			discount_amount: quotes.discount_amount,
			discount_label: quotes.discount_label,
			tax_rate: quotes.tax_rate,
			tax_amount: quotes.tax_amount,
			total: quotes.total,
			deposit_required: quotes.deposit_required,
			deposit_type: quotes.deposit_type,
			deposit_percent: quotes.deposit_percent,
			deposit_amount: quotes.deposit_amount,
			deposit_paid_amount: quotes.deposit_paid_amount,
			deposit_paid_at: quotes.deposit_paid_at,
			notes: quotes.notes,
			terms: quotes.terms,
			viewed_at: quotes.viewed_at,
			expires_at: quotes.expires_at,
			accepted_package_id: quotes.accepted_package_id,
			accepted_subtotal: quotes.accepted_subtotal,
			accepted_tax_amount: quotes.accepted_tax_amount,
			accepted_total: quotes.accepted_total,
			stored_hash: quotes.public_token_hash,
			deleted_at: quotes.deleted_at
		})
		.from(quotes)
		.innerJoin(contacts, eq(contacts.id, quotes.contact_id))
		.innerJoin(organizations, eq(organizations.id, quotes.org_id))
		.leftJoin(orgMembers, eq(orgMembers.id, quotes.issued_by))
		.leftJoin(contactAddresses, eq(contactAddresses.id, quotes.service_address_id))
		.where(eq(quotes.public_token_hash, hash))
		.limit(1);

	if (!row) return { ok: false };
	if (!constantTimeEqualHex(row.stored_hash, hash)) return { ok: false };
	if (row.deleted_at) return { ok: false };
	if (row.status === 'draft') return { ok: false };
	if (row.status === 'declined' || row.status === 'expired') return { ok: false };
	// Accepted quotes stay permanently reachable as a read-only confirmation view — the
	// client can always return to /q/[token] to see what they accepted, pay a still-owed
	// deposit, or confirm a deposit was received. Acceptance locks the quote in, so it also
	// bypasses the expiry window below (an accepted quote never becomes "expired").
	if (row.status !== 'accepted' && row.expires_at && row.expires_at.getTime() < Date.now()) {
		return { ok: false };
	}

	return {
		ok: true,
		quote: {
			id: row.id,
			org_id: row.org_id,
			contact_id: row.contact_id,
			contact_name: row.contact_name,
			contact_phone: row.contact_phone ?? '',
			org_name: row.org_name,
			org_logo_url: row.org_logo_url ?? null,
			org_primary_color: row.org_primary_color ?? null,
			org_tagline: row.org_tagline ?? null,
			org_signature_block_enabled: row.org_signature_block_enabled,
			org_signature_name: row.org_signature_name ?? null,
			org_signature_title: row.org_signature_title ?? null,
			org_signature_statement: row.org_signature_statement ?? null,
			org_signature_image_url: row.org_signature_image_url ?? null,
			issued_by_name: row.issued_by_name ?? null,
			service_address:
				row.service_address_id && row.addr_line_1
					? {
							id: row.service_address_id,
							label: row.addr_label!,
							address_line_1: row.addr_line_1,
							address_line_2: row.addr_line_2,
							city: row.addr_city!,
							state: row.addr_state!,
							zip: row.addr_zip!
						}
					: null,
			quote_number: row.quote_number,
			title: row.title,
			status: row.status,
			current_version: row.current_version,
			subtotal: row.subtotal,
			discount_type: row.discount_type,
			discount_value: row.discount_value,
			discount_amount: row.discount_amount,
			discount_label: row.discount_label,
			tax_rate: row.tax_rate,
			tax_amount: row.tax_amount,
			total: row.total,
			deposit_required: row.deposit_required,
			deposit_type: row.deposit_type,
			deposit_percent: row.deposit_percent,
			deposit_amount: row.deposit_amount,
			deposit_paid_amount: row.deposit_paid_amount,
			deposit_paid_at: row.deposit_paid_at,
			notes: row.notes,
			terms: row.terms,
			viewed_at: row.viewed_at,
			expires_at: row.expires_at,
			accepted_package_id: row.accepted_package_id ?? null,
			accepted_subtotal: row.accepted_subtotal ?? null,
			accepted_tax_amount: row.accepted_tax_amount ?? null,
			accepted_total: row.accepted_total ?? null
		}
	};
}

export type LookupForActionResult =
	| { ok: true; quote: ValidQuoteRow }
	| { ok: false; alreadyTerminal: 'accepted' | 'declined' | null };

/**
 * For accept/decline: returns alreadyTerminal so callers can be idempotent
 * without re-emitting events. All other invalid states map to generic ok:false.
 */
export async function lookupQuoteForAction(rawToken: string): Promise<LookupForActionResult> {
	if (!rawToken || rawToken.length < 16) return { ok: false, alreadyTerminal: null };
	const hash = hashToken(rawToken);
	const [row] = await db
		.select({
			id: quotes.id,
			org_id: quotes.org_id,
			status: quotes.status,
			expires_at: quotes.expires_at,
			deleted_at: quotes.deleted_at,
			stored_hash: quotes.public_token_hash
		})
		.from(quotes)
		.where(eq(quotes.public_token_hash, hash))
		.limit(1);
	if (!row) return { ok: false, alreadyTerminal: null };
	if (!constantTimeEqualHex(row.stored_hash, hash)) {
		return { ok: false, alreadyTerminal: null };
	}
	if (row.deleted_at) return { ok: false, alreadyTerminal: null };
	if (row.status === 'accepted') return { ok: false, alreadyTerminal: 'accepted' };
	if (row.status === 'declined') return { ok: false, alreadyTerminal: 'declined' };
	if (row.status === 'expired') return { ok: false, alreadyTerminal: null };
	if (row.status === 'draft') return { ok: false, alreadyTerminal: null };
	if (row.status === 'changes_requested') return { ok: false, alreadyTerminal: null };
	if (row.expires_at && row.expires_at.getTime() < Date.now()) {
		return { ok: false, alreadyTerminal: null };
	}
	// Re-run full lookup to return the joined row consistently
	const result = await lookupValidQuoteByToken(rawToken);
	if (!result.ok) return { ok: false, alreadyTerminal: null };
	return { ok: true, quote: result.quote };
}

export function sha256Hex(input: string): string {
	return createHash('sha256').update(input, 'utf8').digest('hex');
}

export function clientIpFrom(request: Request): string {
	const xff = request.headers.get('x-forwarded-for');
	if (xff) return xff.split(',')[0]?.trim() ?? 'unknown';
	const real = request.headers.get('x-real-ip');
	if (real) return real.trim();
	return 'unknown';
}
