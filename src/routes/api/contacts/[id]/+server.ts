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
	loadContactDetail,
	countLinkedRecords,
	hasAnyLinks
} from '$lib/server/contacts/contactRepo';

export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!auth.member.can_view_all_contacts) error(403, 'Forbidden');

	const detail = await loadContactDetail(auth.orgId, event.params.id);
	if (!detail) error(404, 'Contact not found');

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
				error: 'sms_opt_out cannot be modified manually. Re-opt-in occurs only via inbound START/YES.',
				code: 'OPT_OUT_IMMUTABLE'
			},
			{ status: 422 }
		);
	}

	const parsed = updateContactSchema.safeParse(body);
	if (!parsed.success) {
		return json(
			{ error: parsed.error.issues[0]?.message ?? 'Invalid input', code: 'VALIDATION_ERROR' },
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

	const next: Record<string, unknown> = { updated_at: new Date() };

	if (updates.full_name !== undefined) next.full_name = updates.full_name;
	if (updates.email !== undefined) next.email = updates.email;
	if (updates.lead_source !== undefined) next.lead_source = updates.lead_source;
	if (updates.status !== undefined) next.status = updates.status;
	if (updates.notes !== undefined) next.notes = updates.notes;
	if (updates.tags !== undefined) next.tags = updates.tags;

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
		.select({ id: contacts.id })
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
