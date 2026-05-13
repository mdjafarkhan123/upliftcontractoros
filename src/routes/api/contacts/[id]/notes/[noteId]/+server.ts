import { json, error } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { contactNotes } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';

export const DELETE: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!auth.member.can_edit_contacts) error(403, 'Forbidden');

	const [existing] = await db
		.select({ id: contactNotes.id })
		.from(contactNotes)
		.where(
			and(
				eq(contactNotes.org_id, auth.orgId),
				eq(contactNotes.id, event.params.noteId),
				eq(contactNotes.contact_id, event.params.id),
				isNull(contactNotes.deleted_at)
			)
		)
		.limit(1);

	if (!existing) error(404, 'Note not found');

	await db
		.update(contactNotes)
		.set({ deleted_at: new Date(), updated_at: new Date() })
		.where(
			and(
				eq(contactNotes.org_id, auth.orgId),
				eq(contactNotes.id, event.params.noteId)
			)
		);

	return json({ ok: true });
};
