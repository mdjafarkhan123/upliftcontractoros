import { json, error } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { contactAddresses } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { addressUpdateSchema } from '$lib/server/contacts/schemas';

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

	const parsed = addressUpdateSchema.safeParse(body);
	if (!parsed.success) {
		return json(
			{ error: parsed.error.issues[0]?.message ?? 'Invalid input', code: 'VALIDATION_ERROR' },
			{ status: 422 }
		);
	}

	const data = parsed.data;

	const [existing] = await db
		.select()
		.from(contactAddresses)
		.where(
			and(
				eq(contactAddresses.org_id, auth.orgId),
				eq(contactAddresses.id, event.params.addrId),
				eq(contactAddresses.contact_id, event.params.id),
				isNull(contactAddresses.deleted_at)
			)
		)
		.limit(1);

	if (!existing) error(404, 'Address not found');

	const next: Record<string, unknown> = { updated_at: new Date() };
	if (data.label !== undefined) next.label = data.label;
	if (data.address_line_1 !== undefined) next.address_line_1 = data.address_line_1;
	if (data.address_line_2 !== undefined) next.address_line_2 = data.address_line_2 ?? null;
	if (data.city !== undefined) next.city = data.city;
	if (data.state !== undefined) next.state = data.state;
	if (data.zip !== undefined) next.zip = data.zip;

	const updated = await db.transaction(async (tx) => {
		if (data.is_primary === true && !existing.is_primary) {
			await tx
				.update(contactAddresses)
				.set({ is_primary: false, updated_at: new Date() })
				.where(
					and(
						eq(contactAddresses.contact_id, event.params.id),
						eq(contactAddresses.org_id, auth.orgId),
						isNull(contactAddresses.deleted_at)
					)
				);
			next.is_primary = true;
		} else if (data.is_primary === false && existing.is_primary) {
			// Cannot unset primary without setting another. Reject explicit unset.
			return null;
		}

		const [row] = await tx
			.update(contactAddresses)
			.set(next)
			.where(
				and(
					eq(contactAddresses.org_id, auth.orgId),
					eq(contactAddresses.id, event.params.addrId)
				)
			)
			.returning();
		return row;
	});

	if (!updated) {
		return json(
			{
				error: 'Cannot remove primary status directly. Set another address as primary instead.',
				code: 'PRIMARY_REQUIRED'
			},
			{ status: 422 }
		);
	}

	return json({ address: updated });
};

export const DELETE: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!auth.member.can_edit_contacts) error(403, 'Forbidden');

	const [existing] = await db
		.select()
		.from(contactAddresses)
		.where(
			and(
				eq(contactAddresses.org_id, auth.orgId),
				eq(contactAddresses.id, event.params.addrId),
				eq(contactAddresses.contact_id, event.params.id),
				isNull(contactAddresses.deleted_at)
			)
		)
		.limit(1);

	if (!existing) error(404, 'Address not found');

	await db
		.update(contactAddresses)
		.set({ deleted_at: new Date(), updated_at: new Date(), is_primary: false })
		.where(
			and(
				eq(contactAddresses.org_id, auth.orgId),
				eq(contactAddresses.id, event.params.addrId)
			)
		);

	return json({ ok: true });
};
