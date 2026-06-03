import { createHash } from 'crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { contacts, organizations, quotes } from '$lib/server/db/schema';
import { constantTimeEqualHex, hashToken } from './token';

export type ValidQuoteRow = {
	id: string;
	org_id: string;
	contact_id: string;
	contact_name: string;
	contact_phone: string;
	org_name: string;
	quote_number: number;
	title: string;
	status: 'draft' | 'sent' | 'viewed' | 'accepted' | 'declined' | 'expired' | 'changes_requested';
	subtotal: string;
	tax_rate: string;
	tax_amount: string;
	total: string;
	deposit_required: boolean;
	deposit_amount: string | null;
	deposit_paid_amount: number;
	deposit_paid_at: Date | null;
	notes: string | null;
	viewed_at: Date | null;
	expires_at: Date | null;
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
			quote_number: quotes.quote_number,
			title: quotes.title,
			status: quotes.status,
			subtotal: quotes.subtotal,
			tax_rate: quotes.tax_rate,
			tax_amount: quotes.tax_amount,
			total: quotes.total,
			deposit_required: quotes.deposit_required,
			deposit_amount: quotes.deposit_amount,
			deposit_paid_amount: quotes.deposit_paid_amount,
			deposit_paid_at: quotes.deposit_paid_at,
			notes: quotes.notes,
			viewed_at: quotes.viewed_at,
			expires_at: quotes.expires_at,
			stored_hash: quotes.public_token_hash,
			deleted_at: quotes.deleted_at
		})
		.from(quotes)
		.innerJoin(contacts, eq(contacts.id, quotes.contact_id))
		.innerJoin(organizations, eq(organizations.id, quotes.org_id))
		.where(eq(quotes.public_token_hash, hash))
		.limit(1);

	if (!row) return { ok: false };
	if (!constantTimeEqualHex(row.stored_hash, hash)) return { ok: false };
	if (row.deleted_at) return { ok: false };
	if (row.status === 'draft') return { ok: false };
	// Keep accepted quotes reachable when a deposit is still owed — the client must be
	// able to return to /q/[token] to pay the deposit after acceptance.
	if (row.status === 'declined' || row.status === 'expired') return { ok: false };
	if (row.status === 'accepted') {
		const owesDeposit = row.deposit_required && row.deposit_paid_amount === 0;
		if (!owesDeposit) return { ok: false };
	}
	if (row.expires_at && row.expires_at.getTime() < Date.now()) return { ok: false };

	return {
		ok: true,
		quote: {
			id: row.id,
			org_id: row.org_id,
			contact_id: row.contact_id,
			contact_name: row.contact_name,
			contact_phone: row.contact_phone,
			org_name: row.org_name,
			quote_number: row.quote_number,
			title: row.title,
			status: row.status,
			subtotal: row.subtotal,
			tax_rate: row.tax_rate,
			tax_amount: row.tax_amount,
			total: row.total,
			deposit_required: row.deposit_required,
			deposit_amount: row.deposit_amount,
			deposit_paid_amount: row.deposit_paid_amount,
			deposit_paid_at: row.deposit_paid_at,
			notes: row.notes,
			viewed_at: row.viewed_at,
			expires_at: row.expires_at
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
