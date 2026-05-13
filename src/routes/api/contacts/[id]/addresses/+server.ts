import { json, error } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { contacts, contactAddresses } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { addressSchema } from '$lib/server/contacts/schemas';

export const POST: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!auth.member.can_edit_contacts) error(403, 'Forbidden');

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

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		error(400, 'Invalid JSON body');
	}

	const parsed = addressSchema.safeParse(body);
	if (!parsed.success) {
		return json(
			{ error: parsed.error.issues[0]?.message ?? 'Invalid input', code: 'VALIDATION_ERROR' },
			{ status: 422 }
		);
	}

	const data = parsed.data;
	const makePrimary = data.is_primary === true;

	const inserted = await db.transaction(async (tx) => {
		// If no addresses exist yet, this is automatically primary.
		const [existingCount] = await tx
			.select({ id: contactAddresses.id })
			.from(contactAddresses)
			.where(
				and(
					eq(contactAddresses.contact_id, event.params.id),
					eq(contactAddresses.org_id, auth.orgId),
					isNull(contactAddresses.deleted_at)
				)
			)
			.limit(1);

		const shouldBePrimary = makePrimary || !existingCount;

		if (shouldBePrimary) {
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
		}

		const [row] = await tx
			.insert(contactAddresses)
			.values({
				org_id: auth.orgId,
				contact_id: event.params.id,
				label: data.label,
				address_line_1: data.address_line_1,
				address_line_2: data.address_line_2 ?? null,
				city: data.city,
				state: data.state,
				zip: data.zip,
				is_primary: shouldBePrimary
			})
			.returning();

		return row;
	});

	return json({ address: inserted }, { status: 201 });
};
