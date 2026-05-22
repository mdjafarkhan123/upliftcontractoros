import { createHash, timingSafeEqual } from 'crypto';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { contacts, invoices, organizations } from '$lib/server/db/schema';
import { generateToken } from '$lib/server/quotes/token';

export { generateToken };

export type ValidInvoiceRow = {
	id: string;
	org_id: string;
	contact_id: string;
	contact_name: string;
	contact_email: string | null;
	org_name: string;
	invoice_number: number;
	title: string;
	status: 'draft' | 'sent' | 'partially_paid' | 'paid' | 'overdue' | 'cancelled';
	subtotal: string;
	tax_rate: string;
	tax_amount: string;
	total: string;
	amount_paid: string;
	amount_due: string;
	notes: string | null;
	viewed_at: Date | null;
	due_date: string | null;
	stripe_secret_key: string | null;
};

export type InvoiceLookupResult =
	| { ok: true; invoice: ValidInvoiceRow }
	| { ok: false };

function constantTimeEqualString(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	try {
		const aBuf = Buffer.from(a, 'utf8');
		const bBuf = Buffer.from(b, 'utf8');
		if (aBuf.length !== bBuf.length) return false;
		return timingSafeEqual(aBuf, bBuf);
	} catch {
		return false;
	}
}

export async function lookupValidInvoiceByToken(rawToken: string): Promise<InvoiceLookupResult> {
	if (!rawToken || rawToken.length < 16) return { ok: false };
	const [row] = await db
		.select({
			id: invoices.id,
			org_id: invoices.org_id,
			contact_id: invoices.contact_id,
			contact_name: contacts.full_name,
			contact_email: contacts.email,
			org_name: organizations.name,
			invoice_number: invoices.invoice_number,
			title: invoices.title,
			status: invoices.status,
			subtotal: invoices.subtotal,
			tax_rate: invoices.tax_rate,
			tax_amount: invoices.tax_amount,
			total: invoices.total,
			amount_paid: invoices.amount_paid,
			amount_due: invoices.amount_due,
			notes: invoices.notes,
			viewed_at: invoices.viewed_at,
			due_date: invoices.due_date,
			stored_token: invoices.public_token,
			deleted_at: invoices.deleted_at,
			stripe_secret_key: organizations.stripe_restricted_key
		})
		.from(invoices)
		.innerJoin(contacts, eq(contacts.id, invoices.contact_id))
		.innerJoin(organizations, eq(organizations.id, invoices.org_id))
		.where(eq(invoices.public_token, rawToken))
		.limit(1);

	if (!row || !row.stored_token) return { ok: false };
	if (!constantTimeEqualString(row.stored_token, rawToken)) return { ok: false };
	if (row.deleted_at) return { ok: false };
	if (row.status === 'draft') return { ok: false };
	if (row.status === 'cancelled') return { ok: false };

	return {
		ok: true,
		invoice: {
			id: row.id,
			org_id: row.org_id,
			contact_id: row.contact_id,
			contact_name: row.contact_name,
			contact_email: row.contact_email,
			org_name: row.org_name,
			invoice_number: row.invoice_number,
			title: row.title,
			status: row.status,
			subtotal: row.subtotal,
			tax_rate: row.tax_rate,
			tax_amount: row.tax_amount,
			total: row.total,
			amount_paid: row.amount_paid,
			amount_due: row.amount_due,
			notes: row.notes,
			viewed_at: row.viewed_at,
			due_date: row.due_date,
			stripe_secret_key: row.stripe_secret_key
		}
	};
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

export function publicInvoiceUrl(rawToken: string): string {
	const base = process.env.APP_URL ?? 'http://localhost:5173';
	return `${base.replace(/\/$/, '')}/i/${rawToken}`;
}
