import { error, json } from '@sveltejs/kit';
import { and, desc, eq, ilike, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { contacts, orgMembers, contactAddresses } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { toE164 } from '$lib/utils/phone';
import { isLeadSource } from '$lib/contacts/leadSource';

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

const HEADERS = [
	'Full Name',
	'Company',
	'Phone',
	'Alt Phone',
	'Email',
	'Status',
	'Lead Source',
	'Lead Temperature',
	'Tags',
	'Assigned To',
	'Address Line 1',
	'Address Line 2',
	'City',
	'State',
	'Zip',
	'Notes',
	'Email Opt In',
	'Do Not Contact',
	'SMS Opt Out',
	'Last Contacted At',
	'Next Follow Up At',
	'Created At'
];

// Shared by the GET (filtered) and POST (selected ids) exports so both emit an
// identical column set. The primary service address is flattened via a leftJoin
// on is_primary, so multiple addresses can't multiply a contact's export rows.
async function selectContacts(conditions: SQL[]) {
	return db
		.select({
			full_name: contacts.full_name,
			company_name: contacts.company_name,
			phone: contacts.phone,
			alt_phone: contacts.alt_phone,
			email: contacts.email,
			status: contacts.status,
			lead_source: contacts.lead_source,
			lead_temperature: contacts.lead_temperature,
			tags: contacts.tags,
			assignee_name: orgMembers.full_name,
			address_line_1: contactAddresses.address_line_1,
			address_line_2: contactAddresses.address_line_2,
			city: contactAddresses.city,
			state: contactAddresses.state,
			zip: contactAddresses.zip,
			notes: contacts.notes,
			email_opt_in: contacts.email_opt_in,
			do_not_contact: contacts.do_not_contact,
			sms_opt_out: contacts.sms_opt_out,
			last_contacted_at: contacts.last_contacted_at,
			next_follow_up_at: contacts.next_follow_up_at,
			created_at: contacts.created_at
		})
		.from(contacts)
		.leftJoin(orgMembers, eq(orgMembers.id, contacts.assigned_to))
		.leftJoin(
			contactAddresses,
			and(
				eq(contactAddresses.contact_id, contacts.id),
				eq(contactAddresses.is_primary, true),
				isNull(contactAddresses.deleted_at)
			)
		)
		.where(and(...conditions))
		.orderBy(desc(contacts.created_at), desc(contacts.id))
		.limit(MAX_ROWS);
}

function toCsv(rows: Awaited<ReturnType<typeof selectContacts>>): string {
	const lines: string[] = [row(HEADERS)];
	for (const r of rows) {
		lines.push(
			row([
				r.full_name,
				r.company_name,
				r.phone,
				r.alt_phone,
				r.email,
				r.status,
				r.lead_source,
				r.lead_temperature,
				r.tags.join('|'),
				r.assignee_name,
				r.address_line_1,
				r.address_line_2,
				r.city,
				r.state,
				r.zip,
				r.notes,
				r.email_opt_in ? 'yes' : 'no',
				r.do_not_contact ? 'yes' : 'no',
				r.sms_opt_out ? 'yes' : 'no',
				r.last_contacted_at ? r.last_contacted_at.toISOString() : '',
				r.next_follow_up_at ? r.next_follow_up_at.toISOString() : '',
				r.created_at.toISOString()
			])
		);
	}
	return lines.join('\r\n');
}

function csvResponse(csv: string): Response {
	const date = new Date().toISOString().slice(0, 10);
	return new Response(csv, {
		headers: {
			'Content-Type': 'text/csv; charset=utf-8',
			'Content-Disposition': `attachment; filename="contacts-${date}.csv"`,
			'Cache-Control': 'no-store'
		}
	});
}

export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);

	const url = event.url;
	const searchRaw = (url.searchParams.get('q') ?? '').trim();
	const statusFilter = url.searchParams.get('status') ?? 'all';
	const tagFilter = (url.searchParams.get('tag') ?? '').trim();
	const tempFilter = (url.searchParams.get('temp') ?? '').trim();
	const sourceFilter = (url.searchParams.get('source') ?? '').trim();
	const followUpOverdue = url.searchParams.get('follow_up') === 'overdue';
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

	if (tempFilter === 'hot' || tempFilter === 'warm' || tempFilter === 'cold') {
		conditions.push(eq(contacts.lead_temperature, tempFilter));
	}

	if (isLeadSource(sourceFilter)) {
		conditions.push(eq(contacts.lead_source, sourceFilter));
	}

	if (followUpOverdue) {
		conditions.push(
			sql`${contacts.next_follow_up_at} IS NOT NULL AND ${contacts.next_follow_up_at} <= now()`
		);
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

	const rows = await selectContacts(conditions);
	return csvResponse(toCsv(rows));
};

const exportSelectedSchema = z.object({
	ids: z.array(z.string().uuid()).min(1).max(MAX_ROWS)
});

// Export only the contacts the user ticked in the bulk action bar. Same column
// set as the filtered GET export; ids are passed in the body (a long selection
// would blow past a URL length limit). Permission gate still applies — a member
// without can_view_all_contacts only exports rows assigned to them.
export const POST: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Invalid request body' }, { status: 400 });
	}

	const parsed = exportSelectedSchema.safeParse(body);
	if (!parsed.success) {
		return json({ error: 'Select at least one contact to export.' }, { status: 400 });
	}

	const conditions: SQL[] = [
		eq(contacts.org_id, auth.orgId),
		isNull(contacts.deleted_at),
		sql`(${contacts.phone} IS NULL OR ${contacts.phone} NOT LIKE 'RELEASED:%')`,
		inArray(contacts.id, parsed.data.ids)
	];
	if (!auth.member.can_view_all_contacts) {
		conditions.push(eq(contacts.assigned_to, auth.member.id));
	}

	const rows = await selectContacts(conditions);
	return csvResponse(toCsv(rows));
};
