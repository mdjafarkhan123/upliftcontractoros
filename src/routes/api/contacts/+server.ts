import { json, error } from '@sveltejs/kit';
import { and, eq, isNull, or, ilike, sql, desc, lt, gt, type SQL } from 'drizzle-orm';
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

const PAGE_SIZE = 25;

export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);

	const url = event.url;
	const searchRaw = (url.searchParams.get('q') ?? '').trim();
	const statusFilter = url.searchParams.get('status') ?? 'all';
	const tagFilter = (url.searchParams.get('tag') ?? '').trim();
	const scope = url.searchParams.get('scope');
	const cursor = url.searchParams.get('cursor');

	const conditions: SQL[] = [
		eq(contacts.org_id, auth.orgId),
		isNull(contacts.deleted_at),
		sql`${contacts.phone} NOT LIKE 'RELEASED:%'`
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

	if (tagFilter.length > 0 && tagFilter.length <= 50) {
		conditions.push(sql`${tagFilter} = ANY(${contacts.tags})`);
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

	if (searchRaw.length > 0) {
		let e164: string | null = null;
		try {
			e164 = toE164(searchRaw);
		} catch {
			e164 = null;
		}
		const digits = searchRaw.replace(/\D+/g, '');
		const searchClauses: SQL[] = [
			ilike(contacts.full_name, `%${searchRaw}%`),
			ilike(contacts.email, `%${searchRaw}%`)
		];
		if (e164) {
			searchClauses.push(eq(contacts.phone, e164));
			searchClauses.push(eq(contacts.alt_phone, e164));
		} else if (digits.length >= 3) {
			searchClauses.push(ilike(contacts.phone, `%${digits}%`));
			searchClauses.push(ilike(contacts.alt_phone, `%${digits}%`));
		}
		const combined = or(...searchClauses);
		if (combined) conditions.push(combined);
	}

	if (cursor) {
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

	const rows = await db
		.select({
			id: contacts.id,
			full_name: contacts.full_name,
			phone: contacts.phone,
			email: contacts.email,
			status: contacts.status,
			lead_source: contacts.lead_source,
			assigned_to: contacts.assigned_to,
			sms_opt_out: contacts.sms_opt_out,
			tags: contacts.tags,
			created_at: contacts.created_at,
			assignee_name: orgMembers.full_name
		})
		.from(contacts)
		.leftJoin(orgMembers, eq(orgMembers.id, contacts.assigned_to))
		.where(and(...conditions))
		.orderBy(desc(contacts.created_at), desc(contacts.id))
		.limit(PAGE_SIZE + 1);

	const hasMore = rows.length > PAGE_SIZE;
	const items = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
	const last = items[items.length - 1];
	const nextCursor = hasMore && last ? `${last.created_at.toISOString()}|${last.id}` : null;

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
					phone: e164,
					email: input.email ?? null,
					lead_source: effectiveLeadSource,
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
