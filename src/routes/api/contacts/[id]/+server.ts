import { json, error } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { contacts } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { toE164, isReleasedPhone, PhoneInvalidError } from '$lib/utils/phone';
import { updateContactSchema } from '$lib/server/contacts/schemas';
import {
	findContactByPhone,
	isAssigneeValid,
	isReferrerValid,
	loadContactDetail,
	countLinkedRecords,
	hasAnyLinks
} from '$lib/server/contacts/contactRepo';

export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);

	const detail = await loadContactDetail(auth.orgId, event.params.id);
	if (!detail) error(404, 'Contact not found');

	// Restricted members can only see contacts assigned to them. Return 404
	// (not 403) so we don't leak the existence of contacts they can't access.
	if (!auth.member.can_view_all_contacts && detail.contact.assigned_to !== auth.member.id) {
		error(404, 'Contact not found');
	}

	return json(detail);
};

export const PATCH: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!auth.member.can_edit_contacts) error(403, 'Forbidden');

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		error(400, 'Invalid JSON body');
	}

	// Disallow direct mutation of sms_opt_out / opt-out metadata via this route.
	// Re-opt-in only happens via inbound START/YES (Chapter 9).
	if (
		body &&
		typeof body === 'object' &&
		('sms_opt_out' in body ||
			'sms_opt_out_at' in body ||
			'sms_opt_out_source' in body ||
			'sms_opted_in_at' in body)
	) {
		return json(
			{
				error:
					'sms_opt_out cannot be modified manually. Re-opt-in occurs only via inbound START/YES.',
				code: 'OPT_OUT_IMMUTABLE'
			},
			{ status: 422 }
		);
	}

	const parsed = updateContactSchema.safeParse(body);
	if (!parsed.success) {
		const issue = parsed.error.issues[0];
		const isUnknownKey = issue?.code === 'unrecognized_keys';
		return json(
			{
				error: issue?.message ?? 'Invalid input',
				code: isUnknownKey ? 'UNKNOWN_FIELD' : 'VALIDATION_ERROR'
			},
			{ status: 422 }
		);
	}

	const updates = parsed.data;

	const [existing] = await db
		.select()
		.from(contacts)
		.where(
			and(
				eq(contacts.org_id, auth.orgId),
				eq(contacts.id, event.params.id),
				isNull(contacts.deleted_at)
			)
		)
		.limit(1);

	if (!existing) error(404, 'Contact not found');

	// Restricted members can only mutate contacts assigned to them. 404 (not
	// 403) avoids leaking the existence of other contacts via probing.
	if (!auth.member.can_view_all_contacts && existing.assigned_to !== auth.member.id) {
		error(404, 'Contact not found');
	}

	// Optimistic concurrency — client must send the updated_at it read.
	if (updates.updated_at !== undefined) {
		const clientStamp = new Date(updates.updated_at).getTime();
		const serverStamp = existing.updated_at.getTime();
		if (clientStamp !== serverStamp) {
			return json(
				{
					error: 'This contact was changed by someone else. Reload and try again.',
					code: 'STALE_UPDATE',
					current_updated_at: existing.updated_at.toISOString()
				},
				{ status: 409 }
			);
		}
	}

	const next: Record<string, unknown> = { updated_at: new Date() };

	if (updates.full_name !== undefined) next.full_name = updates.full_name;
	if (updates.email !== undefined) next.email = updates.email;
	if (updates.lead_source !== undefined) next.lead_source = updates.lead_source;
	if (updates.status !== undefined) next.status = updates.status;
	if (updates.notes !== undefined) next.notes = updates.notes;
	if (updates.tags !== undefined) next.tags = updates.tags;
	if (updates.next_follow_up_at !== undefined) {
		next.next_follow_up_at = updates.next_follow_up_at ? new Date(updates.next_follow_up_at) : null;
	}
	if (updates.preferred_contact_method !== undefined) {
		next.preferred_contact_method = updates.preferred_contact_method;
	}
	if (updates.email_opt_in !== undefined) next.email_opt_in = updates.email_opt_in;

	// Auto-set converted_at on the lead → customer transition. Never cleared
	// when reverting to lead; preserved as historical first-conversion timestamp.
	if (
		updates.status === 'customer' &&
		existing.status === 'lead' &&
		existing.converted_at === null
	) {
		next.converted_at = new Date();
	}

	// Archiving a contact with live linked records would make it disappear from
	// default views while opportunities/jobs/quotes/invoices/conversations still
	// reference it. Same guard pattern as DELETE — close or reassign first.
	if (updates.status === 'archived' && existing.status !== 'archived') {
		const counts = await countLinkedRecords(auth.orgId, event.params.id);
		if (hasAnyLinks(counts)) {
			return json(
				{
					error: 'Contact has linked records. Close or reassign them before archiving.',
					code: 'CONTACT_HAS_LINKS',
					counts
				},
				{ status: 409 }
			);
		}
	}

	if (updates.assigned_to !== undefined) {
		if (updates.assigned_to === null) {
			next.assigned_to = null;
		} else {
			const ok = await isAssigneeValid(auth.orgId, updates.assigned_to);
			if (!ok) {
				return json(
					{
						error: 'Assignee is not an active member of this organization.',
						code: 'INVALID_ASSIGNEE'
					},
					{ status: 422 }
				);
			}
			next.assigned_to = updates.assigned_to;
		}
	}

	if (updates.referred_by_contact_id !== undefined) {
		if (updates.referred_by_contact_id === null) {
			next.referred_by_contact_id = null;
		} else {
			const ok = await isReferrerValid(auth.orgId, updates.referred_by_contact_id, event.params.id);
			if (!ok) {
				return json(
					{
						error: 'Referrer is not a valid contact in this organization.',
						code: 'INVALID_REFERRER'
					},
					{ status: 422 }
				);
			}
			next.referred_by_contact_id = updates.referred_by_contact_id;
			if (!updates.lead_source) next.lead_source = 'referral';
		}
	}

	if (updates.phone !== undefined) {
		if (isReleasedPhone(updates.phone)) {
			return json({ error: 'Invalid phone value.', code: 'PHONE_INVALID' }, { status: 422 });
		}
		let e164: string;
		try {
			e164 = toE164(updates.phone);
		} catch (err) {
			const message = err instanceof PhoneInvalidError ? err.message : 'Invalid phone value.';
			return json({ error: message, code: 'PHONE_INVALID' }, { status: 422 });
		}
		if (e164 !== existing.phone) {
			const conflict = await findContactByPhone(auth.orgId, e164);
			if (conflict && conflict.id !== existing.id) {
				return json(
					{
						error: 'A contact with this phone already exists.',
						code: 'PHONE_DUPLICATE',
						existing_contact_id: conflict.id,
						is_soft_deleted: conflict.deleted_at !== null
					},
					{ status: 409 }
				);
			}
			next.phone = e164;
		}
	}

	try {
		const [updated] = await db
			.update(contacts)
			.set(next)
			.where(and(eq(contacts.org_id, auth.orgId), eq(contacts.id, event.params.id)))
			.returning();

		return json({ contact: updated });
	} catch (e) {
		const msg = e instanceof Error ? e.message : 'Update failed';
		if (/unique|duplicate/i.test(msg)) {
			return json(
				{ error: 'A contact with this phone already exists.', code: 'PHONE_DUPLICATE' },
				{ status: 409 }
			);
		}
		error(500, 'Failed to update contact');
	}
};

export const DELETE: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!auth.member.can_delete_contacts) error(403, 'Forbidden');

	const [existing] = await db
		.select({ id: contacts.id, assigned_to: contacts.assigned_to })
		.from(contacts)
		.where(
			and(
				eq(contacts.org_id, auth.orgId),
				eq(contacts.id, event.params.id),
				isNull(contacts.deleted_at)
			)
		)
		.limit(1);

	if (!existing) error(404, 'Contact not found');
	if (!auth.member.can_view_all_contacts && existing.assigned_to !== auth.member.id) {
		error(404, 'Contact not found');
	}

	const counts = await countLinkedRecords(auth.orgId, event.params.id);
	if (hasAnyLinks(counts)) {
		return json(
			{
				error: 'Contact has linked records. Archive or reassign them first.',
				code: 'CONTACT_HAS_LINKS',
				counts
			},
			{ status: 409 }
		);
	}

	await db
		.update(contacts)
		.set({ deleted_at: new Date(), updated_at: new Date() })
		.where(and(eq(contacts.org_id, auth.orgId), eq(contacts.id, event.params.id)));

	return json({ ok: true });
};
