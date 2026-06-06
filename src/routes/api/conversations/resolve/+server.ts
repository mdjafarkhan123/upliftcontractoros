import { json, error } from '@sveltejs/kit';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { contacts, conversations } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { computeChannelHints, isOrgEmailReady } from '$lib/server/conversations';
import { getCurrentUsage } from '$lib/server/usage/assertAndIncrementUsage';

/**
 * Read-only resolver for the contact → inbox deep link. Given a contact, returns
 * the contact's most-recent non-deleted conversation (any status) if one exists,
 * plus the composer context needed to draft a first message when none does.
 *
 * No mutation: the conversation row for a contact with no history is created
 * lazily on first send (POST /api/conversations/start), not here.
 */
export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);

	if (!auth.member.can_view_all_conversations && !auth.member.can_view_assigned_conversations) {
		error(403, 'Forbidden');
	}

	const contactId = event.url.searchParams.get('contact_id');
	if (!contactId) error(400, 'contact_id is required');

	const [contact] = await db
		.select({
			id: contacts.id,
			full_name: contacts.full_name,
			phone: contacts.phone,
			email: contacts.email,
			status: contacts.status,
			sms_opt_out: contacts.sms_opt_out,
			lead_source: contacts.lead_source
		})
		.from(contacts)
		.where(
			and(eq(contacts.id, contactId), eq(contacts.org_id, auth.orgId), isNull(contacts.deleted_at))
		)
		.limit(1);
	if (!contact) error(404, 'Contact not found');

	const [existing] = await db
		.select({
			id: conversations.id,
			last_message_channel: conversations.last_message_channel
		})
		.from(conversations)
		.where(
			and(
				eq(conversations.org_id, auth.orgId),
				eq(conversations.contact_id, contactId),
				isNull(conversations.deleted_at)
			)
		)
		.orderBy(
			sql`${conversations.last_message_at} DESC NULLS LAST`,
			desc(conversations.created_at),
			desc(conversations.id)
		)
		.limit(1);

	const emailReady = await isOrgEmailReady(auth.orgId);
	const channelHints = computeChannelHints(
		{ id: existing?.id ?? '', last_message_channel: existing?.last_message_channel ?? null },
		{ phone: contact.phone, email: contact.email, sms_opt_out: contact.sms_opt_out },
		false,
		emailReady,
		// Messenger cannot be initiated outbound — replies are only allowed inside
		// Meta's 24h window, so it's never offered in the compose-new flow.
		false
	);

	const smsUsed = await getCurrentUsage(db, auth.orgId, 'sms_sent');

	return json({
		data: {
			conversation_id: existing?.id ?? null,
			contact,
			available_channels: channelHints.available,
			suggested_channel: channelHints.suggested,
			sms_quota: { used: smsUsed, limit: auth.limits.max_monthly_sms }
		}
	});
};
