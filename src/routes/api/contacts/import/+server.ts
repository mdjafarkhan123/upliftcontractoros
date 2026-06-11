import { json, error } from '@sveltejs/kit';
import { eq, and } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { contacts } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { toE164, PhoneInvalidError } from '$lib/utils/phone';

const MAX_ROWS = 2_000;
const MAX_FILE_BYTES = 5 * 1024 * 1024;

type LeadSource =
	| 'website_form'
	| 'live_chat'
	| 'missed_call'
	| 'manual'
	| 'referral'
	| 'google_ads'
	| 'yelp'
	| 'angi'
	| 'facebook'
	| 'nextdoor'
	| 'door_hanger'
	| 'job_sign'
	| 'repeat_customer'
	| 'other';

const VALID_LEAD_SOURCES = new Set<string>([
	'website_form',
	'live_chat',
	'missed_call',
	'manual',
	'referral',
	'google_ads',
	'yelp',
	'angi',
	'facebook',
	'nextdoor',
	'door_hanger',
	'job_sign',
	'repeat_customer',
	'other'
]);

const VALID_STATUSES = new Set(['lead', 'customer', 'archived']);

// Handles quoted fields (including embedded commas) and escaped double-quotes.
function parseCSV(text: string): string[][] {
	const result: string[][] = [];
	const lines = text.split(/\r?\n/);
	for (const line of lines) {
		if (!line.trim()) continue;
		const fields: string[] = [];
		let cur = '';
		let inQuotes = false;
		for (let i = 0; i < line.length; i++) {
			const ch = line[i];
			if (ch === '"') {
				if (inQuotes && line[i + 1] === '"') {
					cur += '"';
					i++;
				} else {
					inQuotes = !inQuotes;
				}
			} else if (ch === ',' && !inQuotes) {
				fields.push(cur.trim());
				cur = '';
			} else {
				cur += ch;
			}
		}
		fields.push(cur.trim());
		result.push(fields);
	}
	return result;
}

function normalizeKey(h: string): string {
	return h.toLowerCase().replace(/[\s_\-]+/g, '_');
}

const HEADER_MAP: Record<string, string> = {
	full_name: 'full_name',
	name: 'full_name',
	contact_name: 'full_name',
	phone: 'phone',
	phone_number: 'phone',
	mobile: 'phone',
	cell: 'phone',
	alt_phone: 'alt_phone',
	alternate_phone: 'alt_phone',
	secondary_phone: 'alt_phone',
	alt_phone_number: 'alt_phone',
	email: 'email',
	email_address: 'email',
	status: 'status',
	lead_source: 'lead_source',
	source: 'lead_source',
	tags: 'tags',
	tag: 'tags',
	notes: 'notes',
	note: 'notes',
	description: 'notes'
};

export const POST: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!auth.member.can_create_contacts) error(403, 'Forbidden');

	let formData: FormData;
	try {
		formData = await event.request.formData();
	} catch {
		return json({ error: 'Invalid form data' }, { status: 400 });
	}

	const file = formData.get('file');
	if (!(file instanceof File)) {
		return json({ error: 'No CSV file provided' }, { status: 400 });
	}
	if (file.size > MAX_FILE_BYTES) {
		return json({ error: 'File too large. Maximum 5 MB.' }, { status: 400 });
	}

	const text = await file.text();
	const allRows = parseCSV(text);

	if (allRows.length < 2) {
		return json({ error: 'CSV has no data rows.' }, { status: 400 });
	}

	const headerRow = allRows[0].map(normalizeKey);
	const dataRows = allRows.slice(1);

	const fieldIndex: Record<string, number> = {};
	for (let i = 0; i < headerRow.length; i++) {
		const canonical = HEADER_MAP[headerRow[i]];
		if (canonical && !(canonical in fieldIndex)) {
			fieldIndex[canonical] = i;
		}
	}

	if (!('full_name' in fieldIndex)) {
		return json(
			{ error: 'CSV must have a "Full Name" or "Name" column.' },
			{ status: 400 }
		);
	}

	const get = (row: string[], field: string): string => {
		const idx = fieldIndex[field];
		return idx !== undefined ? (row[idx] ?? '').trim() : '';
	};

	// Load all existing phones for this org to detect duplicates.
	const existingRows = await db
		.select({ phone: contacts.phone })
		.from(contacts)
		.where(and(eq(contacts.org_id, auth.orgId)));
	const existingPhones = new Set(existingRows.map((r) => r.phone).filter(Boolean));

	type InsertRow = {
		org_id: string;
		full_name: string;
		phone: string | null;
		alt_phone: string | null;
		email: string | null;
		status: 'lead' | 'customer' | 'archived';
		lead_source: LeadSource;
		tags: string[];
		notes: string | null;
	};

	const toInsert: InsertRow[] = [];
	const importErrors: Array<{ row: number; reason: string }> = [];
	let skipped = 0;

	const limit = Math.min(dataRows.length, MAX_ROWS);

	for (let i = 0; i < limit; i++) {
		const r = dataRows[i];
		const rowNum = i + 2;

		const full_name = get(r, 'full_name');
		if (!full_name) {
			importErrors.push({ row: rowNum, reason: 'Missing name' });
			continue;
		}

		let phone: string | null = null;
		const rawPhone = get(r, 'phone');
		if (rawPhone) {
			try {
				phone = toE164(rawPhone);
			} catch (e) {
				const msg = e instanceof PhoneInvalidError ? e.message : `Invalid phone: ${rawPhone}`;
				importErrors.push({ row: rowNum, reason: msg });
				continue;
			}
			if (existingPhones.has(phone)) {
				skipped++;
				continue;
			}
			existingPhones.add(phone);
		}

		let alt_phone: string | null = null;
		const rawAlt = get(r, 'alt_phone');
		if (rawAlt) {
			try {
				alt_phone = toE164(rawAlt);
			} catch {
				alt_phone = null;
			}
		}

		const rawStatus = get(r, 'status').toLowerCase();
		const status = VALID_STATUSES.has(rawStatus)
			? (rawStatus as 'lead' | 'customer' | 'archived')
			: 'lead';

		const rawSource = get(r, 'lead_source').toLowerCase().replace(/[\s\-]+/g, '_');
		const lead_source: LeadSource = VALID_LEAD_SOURCES.has(rawSource)
			? (rawSource as LeadSource)
			: 'manual';

		const rawTags = get(r, 'tags');
		const tags = rawTags
			? rawTags
					.split(/[|,]/)
					.map((t) => t.trim())
					.filter(Boolean)
			: [];

		const email = get(r, 'email') || null;
		const notes = get(r, 'notes') || null;

		toInsert.push({ org_id: auth.orgId, full_name, phone, alt_phone, email, status, lead_source, tags, notes });
	}

	let imported = 0;
	const BATCH = 100;
	for (let i = 0; i < toInsert.length; i += BATCH) {
		const batch = toInsert.slice(i, i + BATCH);
		await db.insert(contacts).values(batch);
		imported += batch.length;
	}

	return json({ data: { imported, skipped, errors: importErrors.slice(0, 20) } });
};
