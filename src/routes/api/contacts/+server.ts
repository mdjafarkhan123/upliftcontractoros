import { json, error } from '@sveltejs/kit';
import { and, eq, ne, isNull, isNotNull, or, ilike, sql, desc, lt, gt, type SQL } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { contacts, outboxEvents, orgMembers } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { toE164, isReleasedPhone, PhoneInvalidError } from '$lib/utils/phone';
import { createContactSchema } from '$lib/server/contacts/schemas';
import {
	findContactByPhone,
	isAssigneeValid,
	isReferrerValid
} from '$lib/server/contacts/contactRepo';
import { resolveLogoUrl } from '$lib/server/media/resolveLogo';
import { textMatch, textRank } from '$lib/server/search/textSearch';
import { isLeadSource } from '$lib/contacts/leadSource';

const PAGE_SIZE = 25;

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
	const cursor = url.searchParams.get('cursor');

	// The recycle bin ("deleted" filter) is the one view that surfaces
	// soft-deleted contacts; every other filter shows only active rows.
	const showDeleted = statusFilter === 'deleted';

	const conditions: SQL[] = [
		eq(contacts.org_id, auth.orgId),
		showDeleted ? isNotNull(contacts.deleted_at) : isNull(contacts.deleted_at),
		sql`(${contacts.phone} IS NULL OR ${contacts.phone} NOT LIKE 'RELEASED:%')`
	];

	// Restricted members (no can_view_all_contacts) see only contacts assigned
	// to them. `scope` is ignored server-side for these users — the toggle is
	// hidden in the UI for them, but a hand-crafted URL must not widen access.
	const restricted = !auth.member.can_view_all_contacts;
	if (restricted) {
		conditions.push(eq(contacts.assigned_to, auth.member.id));
	}

	if (statusFilter === 'leads') conditions.push(eq(contacts.status, 'lead'));
	else if (statusFilter === 'customers') conditions.push(eq(contacts.status, 'customer'));
	else if (statusFilter === 'archived') conditions.push(eq(contacts.status, 'archived'));
	// Default "All" view = active contacts only (leads + customers). Archived
	// contacts live solely in their own tab — never mixed into the active list.
	else if (!showDeleted) conditions.push(ne(contacts.status, 'archived'));

	if (tagFilter.length > 0 && tagFilter.length <= 50) {
		conditions.push(sql`${tagFilter} = ANY(${contacts.tags})`);
	}

	if (tempFilter === 'hot' || tempFilter === 'warm' || tempFilter === 'cold') {
		conditions.push(eq(contacts.lead_temperature, tempFilter));
	}

	// Lead source filter — validated against the enum before it touches SQL.
	if (isLeadSource(sourceFilter)) {
		conditions.push(eq(contacts.lead_source, sourceFilter));
	}

	// Overdue follow-up quick filter — past-due `next_follow_up_at`. Archived/deleted
	// are already excluded above, matching the "Needs follow-up" KPI count.
	if (followUpOverdue) {
		conditions.push(sql`${contacts.next_follow_up_at} IS NOT NULL AND ${contacts.next_follow_up_at} <= now()`);
	}

	// Scope filter is only honored for full-access users. Restricted members
	// already have `assigned_to = <self>` enforced above.
	if (!restricted) {
		if (scope === 'mine') {
			conditions.push(eq(contacts.assigned_to, auth.member.id));
		} else if (scope === 'unassigned') {
			conditions.push(isNull(contacts.assigned_to));
		}
	}

	const isSearching = searchRaw.length > 0;
	// Relevance bucket (lower = better match): exact name → name/company/email
	// prefix → everything else (substring + trigram typo hits). Mirrors how
	// Pipedrive/HubSpot order typeahead so the contact you typed surfaces first.
	// The shared helper backs every searchable list; trigram indexes (migration
	// 0079) make both the ILIKE substring and the fuzzy `%` match index-fast.
	let relevance: SQL<number> | null = null;
	if (isSearching) {
		const nameFields = [contacts.full_name, contacts.company_name, contacts.email];
		relevance = textRank(searchRaw, nameFields);

		let e164: string | null = null;
		try {
			e164 = toE164(searchRaw);
		} catch {
			e164 = null;
		}
		const digits = searchRaw.replace(/\D+/g, '');
		// Phone is matched separately from the fuzzy text fields: an exact E.164
		// hit when the query parses as a number, otherwise a digit-substring scan.
		const phoneClauses: SQL[] = [];
		if (e164) {
			phoneClauses.push(eq(contacts.phone, e164));
			phoneClauses.push(eq(contacts.alt_phone, e164));
		} else if (digits.length >= 3) {
			phoneClauses.push(ilike(contacts.phone, `%${digits}%`));
			phoneClauses.push(ilike(contacts.alt_phone, `%${digits}%`));
		}
		const combined = or(textMatch(searchRaw, nameFields), ...phoneClauses);
		if (combined) conditions.push(combined);
	}

	if (cursor) {
		if (isSearching && relevance) {
			// While searching, rows are ordered by relevance first, so the keyset
			// cursor carries the rank too: "<rank>|<iso_created_at>|<id>".
			const [rankStr, createdAt, id] = cursor.split('|');
			const rank = Number(rankStr);
			if (Number.isFinite(rank) && createdAt && id) {
				conditions.push(
					or(
						gt(relevance, rank),
						and(eq(relevance, rank), lt(contacts.created_at, new Date(createdAt))),
						and(
							eq(relevance, rank),
							eq(contacts.created_at, new Date(createdAt)),
							lt(contacts.id, id)
						)
					) as SQL
				);
			}
		} else {
			// cursor format: "<iso_created_at>|<id>"
			const [createdAt, id] = cursor.split('|');
			if (createdAt && id) {
				conditions.push(
					or(
						lt(contacts.created_at, new Date(createdAt)),
						and(eq(contacts.created_at, new Date(createdAt)), lt(contacts.id, id))
					) as SQL
				);
			}
		}
	}

	const rows = await db
		.select({
			id: contacts.id,
			full_name: contacts.full_name,
			company_name: contacts.company_name,
			phone: contacts.phone,
			email: contacts.email,
			status: contacts.status,
			avatar_url: contacts.avatar_url,
			lead_source: contacts.lead_source,
			lead_temperature: contacts.lead_temperature,
			assigned_to: contacts.assigned_to,
			sms_opt_out: contacts.sms_opt_out,
			tags: contacts.tags,
			last_contacted_at: contacts.last_contacted_at,
			created_at: contacts.created_at,
			deleted_at: contacts.deleted_at,
			assignee_name: orgMembers.full_name,
			rank: relevance ?? sql<number>`0`
		})
		.from(contacts)
		.leftJoin(orgMembers, eq(orgMembers.id, contacts.assigned_to))
		.where(and(...conditions))
		.orderBy(
			...(relevance ? [relevance] : []),
			desc(contacts.created_at),
			desc(contacts.id)
		)
		.limit(PAGE_SIZE + 1);

	const hasMore = rows.length > PAGE_SIZE;
	const sliced = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
	// Resolve stored R2 keys to short-lived signed URLs (cached). Only the rows
	// that actually have a photo hit the resolver.
	const items = await Promise.all(
		sliced.map(async ({ rank: _rank, ...r }) => ({
			...r,
			avatar_url: await resolveLogoUrl(r.avatar_url)
		}))
	);
	const last = sliced[sliced.length - 1];
	const nextCursor = hasMore && last
		? isSearching
			? `${last.rank}|${last.created_at.toISOString()}|${last.id}`
			: `${last.created_at.toISOString()}|${last.id}`
		: null;

	return json({ items, next_cursor: nextCursor });
};

export const POST: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!auth.member.can_create_contacts) error(403, 'Forbidden');

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		error(400, 'Invalid JSON body');
	}

	const parsed = createContactSchema.safeParse(body);
	if (!parsed.success) {
		return json(
			{ error: parsed.error.issues[0]?.message ?? 'Invalid input', code: 'VALIDATION_ERROR' },
			{ status: 422 }
		);
	}

	const input = parsed.data;
	// Phone is optional (Messenger / email-only contacts have none). Validate and
	// dedup only when one was provided; otherwise the contact is created phoneless.
	let e164: string | null = null;
	if (input.phone) {
		if (isReleasedPhone(input.phone)) {
			return json({ error: 'Invalid phone value.', code: 'PHONE_INVALID' }, { status: 422 });
		}
		try {
			e164 = toE164(input.phone);
		} catch (err) {
			const message = err instanceof PhoneInvalidError ? err.message : 'Invalid phone value.';
			return json({ error: message, code: 'PHONE_INVALID' }, { status: 422 });
		}
	}

	let altE164: string | null = null;
	if (input.alt_phone) {
		try {
			altE164 = toE164(input.alt_phone);
		} catch (err) {
			const message = err instanceof PhoneInvalidError ? err.message : 'Invalid alternate phone.';
			return json({ error: message, code: 'ALT_PHONE_INVALID' }, { status: 422 });
		}
	}

	if (input.assigned_to) {
		const ok = await isAssigneeValid(auth.orgId, input.assigned_to);
		if (!ok) {
			return json(
				{
					error: 'Assignee is not an active member of this organization.',
					code: 'INVALID_ASSIGNEE'
				},
				{ status: 422 }
			);
		}
	}

	if (input.referred_by_contact_id) {
		const ok = await isReferrerValid(auth.orgId, input.referred_by_contact_id);
		if (!ok) {
			return json(
				{
					error: 'Referrer is not a valid contact in this organization.',
					code: 'INVALID_REFERRER'
				},
				{ status: 422 }
			);
		}
	}

	// Dedup includes soft-deleted (phone reservation rule). Only when a phone was
	// provided — phoneless contacts have no (org_id, phone) dedup key.
	if (e164) {
		const existing = await findContactByPhone(auth.orgId, e164);
		if (existing) {
			return json(
				{
					error: 'A contact with this phone already exists.',
					code: 'PHONE_DUPLICATE',
					existing_contact_id: existing.id,
					is_soft_deleted: existing.deleted_at !== null
				},
				{ status: 409 }
			);
		}
	}

	try {
		const result = await db.transaction(async (tx) => {
			const effectiveLeadSource = input.referred_by_contact_id
				? 'referral'
				: (input.lead_source ?? 'manual');

			const [inserted] = await tx
				.insert(contacts)
				.values({
					org_id: auth.orgId,
					full_name: input.full_name,
					company_name: input.company_name ?? null,
					phone: e164,
					alt_phone: altE164,
					// Label only meaningful when there is an alt number.
					alt_phone_label: altE164 ? (input.alt_phone_label ?? null) : null,
					email: input.email ?? null,
					lead_source: effectiveLeadSource,
					lead_temperature: input.lead_temperature ?? null,
					assigned_to: input.assigned_to ?? null,
					referred_by_contact_id: input.referred_by_contact_id ?? null,
					notes: input.notes ?? null,
					tags: input.tags ?? []
				})
				.returning();

			await tx.insert(outboxEvents).values({
				org_id: auth.orgId,
				event_type: 'contact.created',
				resource_type: 'contact',
				resource_id: inserted.id,
				payload: {
					contact_id: inserted.id,
					org_id: auth.orgId,
					full_name: inserted.full_name,
					phone: inserted.phone,
					email: inserted.email,
					lead_source: inserted.lead_source,
					assigned_to: inserted.assigned_to,
					referred_by_contact_id: inserted.referred_by_contact_id,
					tags: inserted.tags
				},
				idempotency_key: `contact.created:${inserted.id}`
			});

			return inserted;
		});

		return json({ contact: result }, { status: 201 });
	} catch (e) {
		const msg = e instanceof Error ? e.message : 'Insert failed';
		// Catch unique violation race on (org_id, phone) — only possible with a phone.
		if (e164 && /unique|duplicate/i.test(msg)) {
			const conflict = await findContactByPhone(auth.orgId, e164);
			return json(
				{
					error: 'A contact with this phone already exists.',
					code: 'PHONE_DUPLICATE',
					existing_contact_id: conflict?.id ?? null,
					is_soft_deleted: conflict?.deleted_at !== null
				},
				{ status: 409 }
			);
		}
		error(500, 'Failed to create contact');
	}
};
