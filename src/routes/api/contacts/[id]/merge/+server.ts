import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { mergeContactSchema } from '$lib/server/contacts/schemas';
import { mergeContacts } from '$lib/server/contacts/contactRepo';

// Merge a duplicate contact into this one. [id] is the survivor; the body's
// `source_id` is the contact absorbed into it. Admin-tier capability — merge
// reparents the entire contact graph, so it is gated stricter than delete.
export const POST: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!auth.member.can_merge_contacts) error(403, 'Forbidden');

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		error(400, 'Invalid JSON body');
	}

	const parsed = mergeContactSchema.safeParse(body);
	if (!parsed.success) {
		return json(
			{ error: parsed.error.issues[0]?.message ?? 'Invalid input', code: 'VALIDATION_ERROR' },
			{ status: 422 }
		);
	}

	const survivorId = event.params.id;
	const sourceId = parsed.data.source_id;

	if (survivorId === sourceId) {
		return json(
			{ error: 'A contact cannot be merged into itself.', code: 'SAME_CONTACT' },
			{ status: 422 }
		);
	}

	const result = await mergeContacts(auth.orgId, survivorId, sourceId, auth.member.id);

	if (!result.ok) {
		if (result.code === 'SAME_CONTACT') {
			return json(
				{ error: 'A contact cannot be merged into itself.', code: 'SAME_CONTACT' },
				{ status: 422 }
			);
		}
		// NOT_FOUND — one or both contacts are missing/soft-deleted in this org.
		error(404, 'Contact not found');
	}

	return json({ contact: result.survivor });
};
