import { error } from '@sveltejs/kit';
import { and, desc, eq, ilike, isNull, or, sql, type SQL } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { contacts, orgMembers } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { toE164 } from '$lib/utils/phone';

const MAX_ROWS = 10_000;

function esc(val: string | null | undefined): string {
	if (val === null || val === undefined) return '';
	const s = String(val);
	if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r')) {
		return `"${s.replace(/"/g, '""')}"`;
	}
	return s;
}

function row(fields: Array<string | null | undefined>): string {
	return fields.map(esc).join(',');
}

export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);

	const url = event.url;
	const searchRaw = (url.searchParams.get('q') ?? '').trim();
	const statusFilter = url.searchParams.get('status') ?? 'all';
	const tagFilter = (url.searchParams.get('tag') ?? '').trim();
	const scope = url.searchParams.get('scope');

	const conditions: SQL[] = [
		eq(contacts.org_id, auth.orgId),
		isNull(contacts.deleted_at),
		sql`(${contacts.phone} IS NULL OR ${contacts.phone} NOT LIKE 'RELEASED:%')`
	];

	const restricted = !auth.member.can_view_all_contacts;
	if (restricted) {
		conditions.push(eq(contacts.assigned_to, auth.member.id));
	}

	if (statusFilter === 'leads') conditions.push(eq(contacts.status, 'lead'));
	else if (statusFilter === 'customers') conditions.push(eq(contacts.status, 'customer'));
	else if (statusFilter === 'archived') conditions.push(eq(contacts.status, 'archived'));

	if (tagFilter.length > 0 && tagFilter.length <= 50) {
		conditions.push(sql`${tagFilter} = ANY(${contacts.tags})`);
	}

	if (!restricted) {
		if (scope === 'mine') conditions.push(eq(contacts.assigned_to, auth.member.id));
		else if (scope === 'unassigned') conditions.push(isNull(contacts.assigned_to));
	}

	if (searchRaw.length > 0) {
		let e164: string | null = null;
		try {
			e164 = toE164(searchRaw);
		} catch {
			e164 = null;
		}
		const digits = searchRaw.replace(/\D+/g, '');
		const clauses: SQL[] = [
			ilike(contacts.full_name, `%${searchRaw}%`),
			ilike(contacts.email, `%${searchRaw}%`)
		];
		if (e164) {
			clauses.push(eq(contacts.phone, e164));
			clauses.push(eq(contacts.alt_phone, e164));
		} else if (digits.length >= 3) {
			clauses.push(ilike(contacts.phone, `%${digits}%`));
			clauses.push(ilike(contacts.alt_phone, `%${digits}%`));
		}
		const combined = or(...clauses);
		if (combined) conditions.push(combined);
	}

	const rows = await db
		.select({
			full_name: contacts.full_name,
			phone: contacts.phone,
			alt_phone: contacts.alt_phone,
			email: contacts.email,
			status: contacts.status,
			lead_source: contacts.lead_source,
			tags: contacts.tags,
			assignee_name: orgMembers.full_name,
			notes: contacts.notes,
			do_not_contact: contacts.do_not_contact,
			sms_opt_out: contacts.sms_opt_out,
			created_at: contacts.created_at
		})
		.from(contacts)
		.leftJoin(orgMembers, eq(orgMembers.id, contacts.assigned_to))
		.where(and(...conditions))
		.orderBy(desc(contacts.created_at), desc(contacts.id))
		.limit(MAX_ROWS);

	const headers = [
		'Full Name',
		'Phone',
		'Alt Phone',
		'Email',
		'Status',
		'Lead Source',
		'Tags',
		'Assigned To',
		'Notes',
		'Do Not Contact',
		'SMS Opt Out',
		'Created At'
	];

	const lines: string[] = [row(headers)];
	for (const r of rows) {
		lines.push(
			row([
				r.full_name,
				r.phone,
				r.alt_phone,
				r.email,
				r.status,
				r.lead_source,
				r.tags.join('|'),
				r.assignee_name,
				r.notes,
				r.do_not_contact ? 'yes' : 'no',
				r.sms_opt_out ? 'yes' : 'no',
				r.created_at.toISOString()
			])
		);
	}

	const csv = lines.join('\r\n');
	const date = new Date().toISOString().slice(0, 10);

	return new Response(csv, {
		headers: {
			'Content-Type': 'text/csv; charset=utf-8',
			'Content-Disposition': `attachment; filename="contacts-${date}.csv"`,
			'Cache-Control': 'no-store'
		}
	});
};
