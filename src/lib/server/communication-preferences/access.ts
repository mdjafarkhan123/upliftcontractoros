import { and, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { contacts } from '$lib/server/db/schema';
import { checkPermission } from '$lib/server/permissions';
import { CommunicationPreferenceMutationError } from './mutations';

type AuthContext = {
	orgId: string;
	member: { id: string };
};

export async function assertCommunicationPreferenceAccess(
	auth: AuthContext,
	contactId: string,
	mode: 'read' | 'write'
) {
	if (mode === 'write' && !(await checkPermission(auth.member.id, 'can_edit_contacts'))) {
		throw new CommunicationPreferenceMutationError('FORBIDDEN', 'Forbidden.', 403);
	}

	const [contact] = await db
		.select({ id: contacts.id, assignedTo: contacts.assigned_to })
		.from(contacts)
		.where(
			and(eq(contacts.org_id, auth.orgId), eq(contacts.id, contactId), isNull(contacts.deleted_at))
		)
		.limit(1);
	if (!contact) {
		throw new CommunicationPreferenceMutationError('CONTACT_NOT_FOUND', 'Contact not found.', 404);
	}

	const canViewAll = await checkPermission(auth.member.id, 'can_view_all_contacts');
	if (mode === 'read' && !canViewAll && contact.assignedTo !== auth.member.id) {
		throw new CommunicationPreferenceMutationError('CONTACT_NOT_FOUND', 'Contact not found.', 404);
	}
	if (
		mode === 'write' &&
		!(await checkPermission(auth.member.id, 'can_view_all_contacts')) &&
		contact.assignedTo !== auth.member.id
	) {
		throw new CommunicationPreferenceMutationError('CONTACT_NOT_FOUND', 'Contact not found.', 404);
	}

	return contact;
}
