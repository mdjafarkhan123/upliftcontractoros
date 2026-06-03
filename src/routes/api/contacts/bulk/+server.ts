import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { bulkContactActionSchema } from '$lib/server/contacts/schemas';
import {
	isAssigneeValid,
	bulkAssignContacts,
	bulkAddTags,
	bulkRemoveTags,
	bulkArchiveContacts
} from '$lib/server/contacts/contactRepo';

// Bulk actions on the contacts list: assign, add/remove tags, archive.
// All gated by can_edit_contacts. Restricted members (no can_view_all_contacts)
// are scoped to contacts assigned to them — the same boundary as single edits.
export const POST: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!auth.member.can_edit_contacts) error(403, 'Forbidden');

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		error(400, 'Invalid JSON body');
	}

	const parsed = bulkContactActionSchema.safeParse(body);
	if (!parsed.success) {
		return json(
			{ error: parsed.error.issues[0]?.message ?? 'Invalid input', code: 'VALIDATION_ERROR' },
			{ status: 422 }
		);
	}

	const input = parsed.data;
	const restrictTo = auth.member.can_view_all_contacts ? null : auth.member.id;

	switch (input.action) {
		case 'assign': {
			if (input.assigned_to !== null) {
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
			const updated = await bulkAssignContacts(
				auth.orgId,
				input.contact_ids,
				input.assigned_to,
				restrictTo
			);
			return json({ updated });
		}
		case 'tag_add': {
			const updated = await bulkAddTags(auth.orgId, input.contact_ids, input.tags, restrictTo);
			return json({ updated });
		}
		case 'tag_remove': {
			const updated = await bulkRemoveTags(auth.orgId, input.contact_ids, input.tags, restrictTo);
			return json({ updated });
		}
		case 'archive': {
			const result = await bulkArchiveContacts(auth.orgId, input.contact_ids, restrictTo);
			return json(result);
		}
	}
};
