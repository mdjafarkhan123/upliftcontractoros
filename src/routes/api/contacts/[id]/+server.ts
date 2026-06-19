import { json, error } from '@sveltejs/kit';
import { and, eq, isNull, isNotNull } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { contacts, media, outboxEvents } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { toE164, isReleasedPhone, PhoneInvalidError } from '$lib/utils/phone';
import { updateContactSchema } from '$lib/server/contacts/schemas';
import { resolveLogoUrl } from '$lib/server/media/resolveLogo';
import {
	findContactByPhone,
	isAssigneeValid,
	isReferrerValid,
	loadContactDetail,
	cascadeDeleteContact,
	hardPurgeContact
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
	if (updates.company_name !== undefined) next.company_name = updates.company_name;
	if (updates.email !== undefined) next.email = updates.email;
	if (updates.lead_source !== undefined) next.lead_source = updates.lead_source;
	if (updates.lead_temperature !== undefined) next.lead_temperature = updates.lead_temperature;

	if (updates.alt_phone !== undefined) {
		if (updates.alt_phone === null || updates.alt_phone === '') {
			next.alt_phone = null;
			// A label without a number is meaningless — clear it alongside.
			next.alt_phone_label = null;
		} else {
			try {
				next.alt_phone = toE164(updates.alt_phone);
			} catch (err) {
				const message = err instanceof PhoneInvalidError ? err.message : 'Invalid alternate phone.';
				return json({ error: message, code: 'ALT_PHONE_INVALID' }, { status: 422 });
			}
		}
	}

	// Apply an explicit label change unless the number was just cleared above.
	if (updates.alt_phone_label !== undefined && next.alt_phone !== null) {
		next.alt_phone_label = updates.alt_phone_label;
	}

	if (updates.do_not_contact !== undefined) {
		next.do_not_contact = updates.do_not_contact;
		if (updates.do_not_contact && !existing.do_not_contact) {
			next.do_not_contact_at = new Date();
		} else if (!updates.do_not_contact) {
			next.do_not_contact_at = null;
		}
	}
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

	// Profile photo. `avatar_url` carries an uploaded media row id (purpose_tag
	// 'contact_avatar'); we store its r2_key. null clears the photo. The previous
	// avatar media is soft-deleted in the write transaction below for storage
	// reclamation (mirrors the org-logo replacement flow).
	if (updates.avatar_url !== undefined) {
		if (updates.avatar_url === null) {
			next.avatar_url = null;
		} else {
			const [m] = await db
				.select({ id: media.id, r2_key: media.r2_key })
				.from(media)
				.where(
					and(
						eq(media.id, updates.avatar_url),
						eq(media.org_id, auth.orgId),
						eq(media.contact_id, event.params.id),
						eq(media.purpose_tag, 'contact_avatar'),
						isNull(media.deleted_at)
					)
				)
				.limit(1);
			if (!m) {
				return json(
					{ error: 'Avatar must reference an uploaded image.', code: 'INVALID_AVATAR' },
					{ status: 422 }
				);
			}
			next.avatar_url = m.r2_key;
		}
	}

	// Auto-set converted_at on the lead → customer transition. Never cleared
	// when reverting to lead; preserved as historical first-conversion timestamp.
	if (
		updates.status === 'customer' &&
		existing.status === 'lead' &&
		existing.converted_at === null
	) {
		next.converted_at = new Date();
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

	// Soft-delete the previous avatar media when the photo is being replaced or
	// cleared, so storage is reclaimed (same as the org-logo flow).
	const avatarChanging = 'avatar_url' in next;
	const prevAvatarKey = existing.avatar_url;
	const newAvatarKey = (next.avatar_url ?? null) as string | null;

	try {
		const updated = await db.transaction(async (tx) => {
			const [row] = await tx
				.update(contacts)
				.set(next)
				.where(and(eq(contacts.org_id, auth.orgId), eq(contacts.id, event.params.id)))
				.returning();

			if (avatarChanging && prevAvatarKey && prevAvatarKey !== newAvatarKey) {
				const [prevMedia] = await tx
					.select()
					.from(media)
					.where(
						and(
							eq(media.org_id, auth.orgId),
							eq(media.r2_key, prevAvatarKey),
							isNull(media.deleted_at)
						)
					)
					.limit(1);
				if (prevMedia) {
					await tx
						.update(media)
						.set({ deleted_at: new Date(), updated_at: new Date() })
						.where(and(eq(media.id, prevMedia.id), isNull(media.deleted_at)));
					await tx.insert(outboxEvents).values({
						org_id: auth.orgId,
						event_type: 'media.deleted',
						resource_type: 'media',
						resource_id: prevMedia.id,
						payload: {
							media_id: prevMedia.id,
							org_id: auth.orgId,
							r2_key: prevMedia.r2_key,
							thumbnail_key: prevMedia.thumbnail_key,
							web_key: prevMedia.web_key
						},
						idempotency_key: `media.deleted:${prevMedia.id}`
					});
				}
			}

			return row;
		});

		return json({
			contact: { ...updated, avatar_url: await resolveLogoUrl(updated.avatar_url) }
		});
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

	// `?permanent=true` hard-purges a contact already in the recycle bin (the
	// "delete forever" action). The default DELETE soft-deletes an active
	// contact into the bin via the cascade.
	const permanent = event.url.searchParams.get('permanent') === 'true';

	const [existing] = await db
		.select({ id: contacts.id, assigned_to: contacts.assigned_to })
		.from(contacts)
		.where(
			and(
				eq(contacts.org_id, auth.orgId),
				eq(contacts.id, event.params.id),
				permanent ? isNotNull(contacts.deleted_at) : isNull(contacts.deleted_at)
			)
		)
		.limit(1);

	if (!existing) error(404, 'Contact not found');
	if (!auth.member.can_view_all_contacts && existing.assigned_to !== auth.member.id) {
		error(404, 'Contact not found');
	}

	if (permanent) {
		const result = await hardPurgeContact(auth.orgId, event.params.id);
		if (!result.purged) {
			if (result.reason === 'not_found') error(404, 'Contact not found');
			return json(
				{
					error:
						'This contact has linked records (jobs, quotes, invoices, conversations…) and can’t be permanently deleted. Restore it to keep its history, or remove the linked records first.',
					code: 'CONTACT_HAS_LINKS'
				},
				{ status: 409 }
			);
		}
		return json({ ok: true });
	}

	await cascadeDeleteContact(auth.orgId, event.params.id);

	return json({ ok: true });
};
