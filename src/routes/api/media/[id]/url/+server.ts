import { json, error } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { media, jobs, contacts, messages, conversations } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { r2Presign } from '$lib/server/media/r2';

export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);

	const id = event.params.id!;
	const variant = (event.url.searchParams.get('variant') ?? 'thumbnail') as
		| 'original'
		| 'web'
		| 'thumbnail';

	const [row] = await db
		.select()
		.from(media)
		.where(and(eq(media.id, id), eq(media.org_id, auth.orgId), isNull(media.deleted_at)))
		.limit(1);

	if (!row) error(404, 'Media not found');

	// Verify parent-resource access
	if (row.contact_id) {
		const [c] = await db
			.select({ id: contacts.id, assigned_to: contacts.assigned_to })
			.from(contacts)
			.where(
				and(
					eq(contacts.id, row.contact_id),
					eq(contacts.org_id, auth.orgId),
					isNull(contacts.deleted_at)
				)
			)
			.limit(1);
		if (!c) error(404, 'Parent contact not found');
		// Need file-view permission, and access to this specific contact.
		if (!auth.member.can_view_all_files) error(403, 'Forbidden');
		if (!auth.member.can_view_all_contacts && c.assigned_to !== auth.member.id) {
			error(403, 'Forbidden');
		}
	} else if (row.job_id) {
		const [j] = await db
			.select({ id: jobs.id, assigned_to: jobs.assigned_to })
			.from(jobs)
			.where(and(eq(jobs.id, row.job_id), eq(jobs.org_id, auth.orgId), isNull(jobs.deleted_at)))
			.limit(1);

		if (!j) error(404, 'Parent job not found');

		// Members with only assigned-job access must own the job
		if (!auth.member.can_view_full_pipeline && j.assigned_to !== auth.member.id) {
			error(403, 'Forbidden');
		}
	} else if (row.quote_id) {
		if (!auth.member.can_view_all_quotes && !auth.member.can_view_all_files) {
			error(403, 'Forbidden');
		}
	} else if (row.invoice_id) {
		if (!auth.member.can_view_all_invoices && !auth.member.can_view_all_files) {
			error(403, 'Forbidden');
		}
	} else if (row.message_id) {
		// Message attachment — gate on conversation access.
		const [m] = await db
			.select({ assigned_to: conversations.assigned_to })
			.from(messages)
			.innerJoin(conversations, eq(conversations.id, messages.conversation_id))
			.where(and(eq(messages.id, row.message_id), eq(messages.org_id, auth.orgId)))
			.limit(1);
		if (!m) error(404, 'Parent conversation not found');
		const canViewConversation =
			auth.member.can_view_all_conversations ||
			(auth.member.can_view_assigned_conversations && m.assigned_to === auth.member.id);
		if (!canViewConversation) error(403, 'Forbidden');
	} else {
		// No parent found — only admins/managers with can_view_all_files
		if (!auth.member.can_view_all_files) error(403, 'Forbidden');
	}

	// Resolve the R2 key for the requested variant
	let r2Key: string;
	if (variant === 'web' && row.web_key) {
		r2Key = row.web_key;
	} else if (variant === 'thumbnail' && row.thumbnail_key) {
		r2Key = row.thumbnail_key;
	} else {
		r2Key = row.r2_key;
	}

	const url = await r2Presign(r2Key, 3600);
	return json({ data: { url, expires_in: 3600 } });
};
