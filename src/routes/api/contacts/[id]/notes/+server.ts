import { json, error } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { contacts, contactNotes } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { noteSchema } from '$lib/server/contacts/schemas';

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

	const parsed = noteSchema.safeParse(body);
	if (!parsed.success) {
		return json(
			{ error: parsed.error.issues[0]?.message ?? 'Invalid input', code: 'VALIDATION_ERROR' },
			{ status: 422 }
		);
	}

	const [inserted] = await db
		.insert(contactNotes)
		.values({
			org_id: auth.orgId,
			contact_id: event.params.id,
			author_id: auth.member.id,
			content: parsed.data.content
		})
		.returning();

	return json(
		{
			note: {
				id: inserted.id,
				content: inserted.content,
				author_id: inserted.author_id,
				author_name: auth.member.full_name,
				created_at: inserted.created_at
			}
		},
		{ status: 201 }
	);
};
